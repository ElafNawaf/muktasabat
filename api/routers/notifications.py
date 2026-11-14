"""Notification centre — one bell for everything that needs the user.

Notifications are *derived* on each request from live data (nothing is
queued), so they are always current and disappear by themselves once the
underlying thing is done. Only "read" marks are stored (``notification_reads``),
keyed by a stable string per event, e.g. ``att:in:2026-11-14`` or ``tk:42:7``.

Staff see what their permissions cover; owners and tenants get their own set.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from api.database import Base
from api.deps import CurrentUser, DbSession
from api.models import Building, Contract, Payment, SupportTicket, SupportTicketMessage, Unit, User
from api.permissions import has_permission

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationRead(Base):
    __tablename__ = "notification_reads"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_notification_read"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class N:
    """Builder for one notification."""

    def __init__(self, locale: str):
        self.ar = locale == "ar"
        self.items: list[dict] = []

    def add(self, key: str, kind: str, icon: str, tone: str, title: tuple[str, str], body: Optional[str] = None,
            at: Optional[datetime | date] = None, href: Optional[str] = None, urgent: bool = False) -> None:
        if isinstance(at, date) and not isinstance(at, datetime):
            at = datetime.combine(at, datetime.min.time())
        self.items.append({
            "key": key, "kind": kind, "icon": icon, "tone": tone,
            "title": title[0] if self.ar else title[1], "body": body,
            "at": (at or datetime.utcnow()).isoformat(), "href": href, "urgent": urgent,
        })


def _money(v) -> str:
    return f"{float(v or 0):,.0f}"


def _last_public_message(db: Session, ticket_id: int) -> Optional[SupportTicketMessage]:
    return db.scalar(
        select(SupportTicketMessage)
        .where(SupportTicketMessage.ticket_id == ticket_id, SupportTicketMessage.internal.is_(False))
        .order_by(SupportTicketMessage.id.desc())
    )


def _tickets(db: Session, user: User, n: N, base: str) -> None:
    open_states = ("open", "in_progress", "waiting", "pending", "on_hold", "new")
    # Replies to tickets I raised.
    for t in db.scalars(select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.updated_at.desc()).limit(30)).all():
        m = _last_public_message(db, t.id)
        if m and m.is_staff and m.author_id != user.id:
            n.add(f"tk:{t.id}:{m.id}", "ticket", "forum", "info", ("ردّ جديد على تذكرتك", "New reply on your ticket"),
                  f"#{t.id} · {t.subject}", m.created_at, f"{base}/support/{t.id}")
        if t.status in ("resolved", "closed") and t.resolved_at and t.resolved_at > datetime.utcnow() - timedelta(days=7):
            n.add(f"tk:{t.id}:done", "ticket", "task_alt", "ok", ("تم حل تذكرتك", "Your ticket was resolved"),
                  f"#{t.id} · {t.subject}", t.resolved_at, f"{base}/support/{t.id}")
    if user.role in ("owner", "tenant"):
        return
    # Tickets assigned to me that are waiting for a reply.
    for t in db.scalars(select(SupportTicket).where(SupportTicket.assignee_id == user.id, SupportTicket.status.in_(open_states))).all():
        m = _last_public_message(db, t.id)
        if m is None or not m.is_staff:
            due = t.response_due_at
            late = bool(due and due < datetime.utcnow())
            n.add(f"tk:{t.id}:{m.id if m else 'new'}:a", "ticket", "confirmation_number", "bad" if late else "soon",
                  ("تذكرة بانتظار ردّك", "A ticket is waiting for your reply"), f"#{t.id} · {t.subject}",
                  m.created_at if m else t.created_at, f"{base}/support/{t.id}", urgent=late or t.priority in ("urgent", "high"))
    # Unassigned tickets for support staff.
    if has_permission(db, user, "support", "edit"):
        k = db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.assignee_id.is_(None), SupportTicket.status.in_(open_states))) or 0
        if k:
            n.add(f"tk:unassigned:{date.today()}:{k}", "ticket", "inbox", "soon", ("تذاكر دعم بدون مسؤول", "Unassigned support tickets"),
                  f"{k}", None, f"{base}/support")


def _attendance(db: Session, user: User, n: N, base: str) -> None:
    try:
        from api.hr_models import Attendance
        from api.routers import hr as H
    except Exception:
        return
    if user.role in getattr(H, "NON_STAFF", ("owner", "tenant")):
        return
    try:
        s = H._settings(db)
        p = db.scalar(select(H.HrProfile).where(H.HrProfile.user_id == user.id)) if hasattr(H, "HrProfile") else None
        today = H.today_riyadh()
        now = H.now_riyadh()
        att = db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.day == today))
        st = H._day_status(db, s, p, user.id, today, att, now)
        end = (p.work_end if p and p.work_end else s.work_end)
    except Exception:
        db.rollback()
        return
    status_ = st.get("status")
    if status_ == "absent" and not (att and att.check_in):
        n.add(f"att:in:{today}", "attendance", "fingerprint", "bad", ("لم تسجّل حضورك اليوم", "You haven't checked in today"),
              None, None, f"{base}/my-hr", urgent=True)
    elif status_ == "late":
        n.add(f"att:late:{today}", "attendance", "schedule", "soon", ("تم تسجيل حضورك متأخراً", "You checked in late today"),
              None, None, f"{base}/my-hr")
    if att and att.check_in and not att.check_out and now.time() >= end:
        n.add(f"att:out:{today}", "attendance", "logout", "soon", ("لا تنسَ تسجيل الانصراف", "Don't forget to check out"),
              None, None, f"{base}/my-hr", urgent=True)
    if "left_area" in (st.get("flags") or []):
        n.add(f"att:area:{today}", "attendance", "wrong_location", "bad", ("أنت خارج نطاق المكتب", "You're outside the office area"),
              None, None, f"{base}/my-hr")


def _hr_requests(db: Session, user: User, n: N, base: str) -> None:
    try:
        from api.hr_models import HrRequest
        from api.routers.hr import _summary
    except Exception:
        return
    since = datetime.utcnow() - timedelta(days=14)
    for r in db.scalars(select(HrRequest).where(HrRequest.user_id == user.id, HrRequest.decided_at.is_not(None), HrRequest.decided_at >= since)).all():
        ok = r.status == "approved"
        n.add(f"hr:{r.id}:{r.status}", "hr", "event_available" if ok else "event_busy", "ok" if ok else "bad",
              ("تمت الموافقة على طلبك", "Your request was approved") if ok else ("تم رفض طلبك", "Your request was declined"),
              f"{r.number} · {_summary(r, 'ar' if n.ar else 'en')}", r.decided_at, f"{base}/my-hr")


def _hr_people(db: Session, user: User, n: N, base: str) -> None:
    """Employee file: contract to accept, assets to confirm, documents expiring; HR: bank changes to approve."""
    try:
        from api.hr_people_models import HrAsset, HrContract, HrPersonal
        from api.permissions import has_permission
        from api.routers.hr import _uname
    except Exception:
        return
    today = date.today()
    for c in db.scalars(select(HrContract).where(HrContract.user_id == user.id, HrContract.status == "pending_acceptance")).all():
        n.add(f"hrc:{c.id}:{c.sent_at}", "hr", "contract_edit", "warn", ("عقد عمل بانتظار موافقتك", "An employment contract needs your review"),
              c.number, c.sent_at, f"{base}/my-file?tab=contracts", urgent=True)
    for a in db.scalars(select(HrAsset).where(HrAsset.assigned_user_id == user.id, HrAsset.acknowledged_at.is_(None))).all():
        n.add(f"hra:{a.id}:{a.assigned_at}", "hr", "inventory_2", "warn", ("أكّد استلام عهدة", "Confirm receipt of an asset"),
              f"{a.name} · {a.tag}", a.assigned_at, f"{base}/my-file?tab=assets")
    per = db.scalar(select(HrPersonal).where(HrPersonal.user_id == user.id))
    if per:
        for k, dt, t in (("id", per.id_expiry, ("هويتك / إقامتك تنتهي قريبًا", "Your ID / Iqama expires soon")),
                         ("pp", per.passport_expiry, ("جوازك ينتهي قريبًا", "Your passport expires soon"))):
            if dt and dt <= today + timedelta(days=30):
                n.add(f"hrx:{k}:{dt}", "hr", "badge", "bad" if dt < today else "warn", t, str(dt), dt, f"{base}/my-file?tab=personal", urgent=dt < today)
    if has_permission(db, user, "hr", "approve"):
        for pr in db.scalars(select(HrPersonal).where(HrPersonal.pending_iban.is_not(None), HrPersonal.user_id != user.id)).all():
            emp = db.get(User, pr.user_id)
            n.add(f"hrb:{pr.user_id}:{pr.pending_bank_at}", "hr", "account_balance", "warn", ("طلب تغيير حساب بنكي", "Bank account change to approve"),
                  _uname(emp, "ar" if n.ar else "en") if emp else None, pr.pending_bank_at, f"{base}/hr/people/{pr.user_id}?tab=bank", urgent=True)


def _approvals(db: Session, user: User, n: N, base: str) -> None:
    try:
        from api.routers.approvals import inbox
    except Exception:
        return
    try:
        data = inbox(db=db, user=user, locale="ar" if n.ar else "en")
    except Exception:
        db.rollback()
        return
    label = {
        "work_order": (("أمر صيانة بانتظار الموافقة", "Work order awaiting approval"), "handyman"),
        "renewal": (("تجديد عقد بانتظار قرار المالك", "Renewal awaiting owner decision"), "autorenew"),
        "payout": (("تحويل حصة مالك مستحق", "Owner payout due"), "account_balance"),
        "hr": (("طلب موظف بانتظار موافقتك", "Staff request awaiting your approval"), "badge"),
    }
    for i in data.get("items", [])[:25]:
        (title, icon) = label.get(i["kind"], (("بانتظار موافقتك", "Awaiting your approval"), "approval"))
        body = " · ".join(str(x) for x in (i.get("ref"), i.get("title"), i.get("where")) if x)
        n.add(f"ap:{i['kind']}:{i['id']}", "approval", icon, "bad" if i.get("urgent") else "soon", title, body,
              datetime.fromisoformat(i["since"]) if i.get("since") else None, f"{base}/{i['href']}", urgent=bool(i.get("urgent")))


def _payments(db: Session, user: User, n: N, base: str) -> None:
    if not has_permission(db, user, "payments", "view"):
        return
    today = date.today()
    mine = [b for (b,) in db.execute(select(Building.id).where(Building.assignee_id == user.id)).all()]
    q = (select(Payment, Contract, Unit, Building)
         .join(Contract, Payment.contract_id == Contract.id).join(Unit, Contract.unit_id == Unit.id).join(Building, Unit.building_id == Building.id)
         .where(Payment.status != "paid", Payment.due_date <= today + timedelta(days=3)))
    if mine:
        q = q.where(Building.id.in_(mine))
    rows = db.execute(q.order_by(Payment.due_date)).all()
    if mine or len(rows) <= 8:
        for p, c, u, b in rows[:15]:
            late = p.due_date < today
            n.add(f"pay:{p.id}:{'late' if late else 'due'}", "payment", "payments", "bad" if late else "soon",
                  ("دفعة متأخرة", "Overdue instalment") if late else ("دفعة مستحقة قريباً", "Instalment due soon"),
                  f"{b.name} · {u.number} · {_money(p.amount)} · {p.due_date}", p.due_date, f"{base}/payments", urgent=late)
    else:
        late = [r for r in rows if r[0].due_date < today]
        soon = [r for r in rows if r[0].due_date >= today]
        if late:
            n.add(f"pay:late:{today}:{len(late)}", "payment", "warning", "bad", ("دفعات متأخرة", "Overdue instalments"),
                  f"{len(late)} · {_money(sum(r[0].amount for r in late))}", today, f"{base}/collections", urgent=True)
        if soon:
            n.add(f"pay:soon:{today}:{len(soon)}", "payment", "event", "soon", ("دفعات مستحقة خلال 3 أيام", "Instalments due within 3 days"),
                  f"{len(soon)} · {_money(sum(r[0].amount for r in soon))}", today, f"{base}/payments")
    if has_permission(db, user, "payments", "edit"):
        try:
            from api.tenant_portal_models import PaymentReport

            k = db.scalar(select(func.count(PaymentReport.id)).where(PaymentReport.status == "pending")) or 0
            if k:
                n.add(f"rep:{today}:{k}", "payment", "mark_email_unread", "info", ("بلاغات سداد من المستأجرين", "Tenant payment reports to confirm"),
                      f"{k}", None, f"{base}/payments", urgent=True)
        except Exception:
            db.rollback()


def _maintenance(db: Session, user: User, n: N, base: str) -> None:
    try:
        from api.maintenance_models import WorkOrder
    except Exception:
        return
    open_ = ("new", "assigned", "approved", "scheduled", "in_progress")
    for w in db.scalars(select(WorkOrder).where(WorkOrder.assignee_id == user.id, WorkOrder.status.in_(open_)).order_by(WorkOrder.created_at.desc()).limit(15)).all():
        late = bool(w.due_at and w.due_at < datetime.utcnow())
        n.add(f"wo:{w.id}:{w.status}", "maintenance", "handyman", "bad" if late else "info",
              ("أمر صيانة مُسند إليك", "Work order assigned to you"), f"{w.number} · {w.title}", w.updated_at or w.created_at,
              f"{base}/maintenance?open={w.id}", urgent=late or w.priority in ("emergency", "high"))


def _leases(db: Session, user: User, n: N, base: str) -> None:
    if not has_permission(db, user, "contracts", "view"):
        return
    today = date.today()
    k = db.scalar(select(func.count(Contract.id)).where(Contract.end_date.between(today, today + timedelta(days=30)),
                                                        func.lower(func.coalesce(Contract.status, "active")) == "active",
                                                        Contract.contract_type.in_(("residential", "commercial")))) or 0
    if k:
        n.add(f"lease:ending:{today.isocalendar()[1]}:{k}", "lease", "hourglass_bottom", "soon", ("عقود تنتهي خلال 30 يوماً", "Leases ending within 30 days"),
              f"{k}", None, f"{base}/renewals")


# ── portal users ──────────────────────────────────────────────────────────


def _tenant(db: Session, user: User, n: N, base: str) -> None:
    from api.tenant_portal_models import PaymentReport, TenantUser

    link = db.scalar(select(TenantUser).where(TenantUser.user_id == user.id))
    if not link:
        return
    today = date.today()
    q = (select(Payment).join(Contract, Payment.contract_id == Contract.id)
         .where(Contract.tenant_id == link.tenant_id, Payment.status != "paid", Payment.due_date <= today + timedelta(days=7)))
    reported = {r for (r,) in db.execute(select(PaymentReport.payment_id).where(PaymentReport.tenant_id == link.tenant_id, PaymentReport.status == "pending")).all()}
    for p in db.scalars(q.order_by(Payment.due_date)).all():
        if p.id in reported:
            continue
        late = p.due_date < today
        days = (p.due_date - today).days
        n.add(f"tpay:{p.id}:{'late' if late else days}", "payment", "payments", "bad" if late else "soon",
              ("دفعة إيجار متأخرة", "Rent instalment overdue") if late else ("دفعة إيجار مستحقة قريباً", "Rent due soon"),
              f"{_money(p.amount)} · {p.due_date}", p.due_date, f"{base}/payments", urgent=late or days <= 1)
    for r in db.scalars(select(PaymentReport).where(PaymentReport.tenant_id == link.tenant_id, PaymentReport.reviewed_at.is_not(None),
                                                    PaymentReport.reviewed_at >= datetime.utcnow() - timedelta(days=30))).all():
        ok = r.status == "confirmed"
        n.add(f"trep:{r.id}:{r.status}", "payment", "task_alt" if ok else "report", "ok" if ok else "bad",
              ("تم تأكيد دفعتك", "Your payment was confirmed") if ok else ("لم نتمكن من تأكيد دفعتك", "We couldn't confirm your payment"),
              f"{_money(r.amount)}{' · ' + r.review_note if r.review_note else ''}", r.reviewed_at, f"{base}/payments")
    for c in db.scalars(select(Contract).where(Contract.tenant_id == link.tenant_id, Contract.end_date.between(today, today + timedelta(days=60)))).all():
        n.add(f"tlease:{c.id}", "lease", "hourglass_bottom", "soon", ("عقدك ينتهي قريباً", "Your lease ends soon"),
              f"{c.contract_number} · {c.end_date}", None, f"{base}/contracts/{c.id}")


def _owner(db: Session, user: User, n: N, base: str) -> None:
    from api.models import OwnerUser

    link = db.scalar(select(OwnerUser).where(OwnerUser.user_id == user.id))
    if not link:
        return
    since = date.today() - timedelta(days=30)
    q = (select(Payment, Unit, Building).join(Contract, Payment.contract_id == Contract.id).join(Unit, Contract.unit_id == Unit.id)
         .join(Building, Unit.building_id == Building.id)
         .where(Building.owner_id == link.owner_id, Payment.owner_transferred_date.is_not(None), Payment.owner_transferred_date >= since))
    for p, u, b in db.execute(q).all():
        n.add(f"opay:{p.id}", "payment", "account_balance", "ok", ("حوّلنا لك حصتك", "We sent your share"),
              f"{b.name} · {u.number}{' · ' + p.owner_transfer_reference if p.owner_transfer_reference else ''}", p.owner_transferred_date, f"{base}/payments")
    try:
        from api.maintenance_models import WorkOrder

        for w in db.scalars(select(WorkOrder).join(Building, WorkOrder.building_id == Building.id)
                            .where(Building.owner_id == link.owner_id, WorkOrder.status == "awaiting_approval")).all():
            n.add(f"owo:{w.id}", "approval", "handyman", "soon", ("صيانة بانتظار موافقتك", "Maintenance awaiting your approval"),
                  f"{w.number} · {w.title}", w.updated_at, f"{base}/maintenance", urgent=True)
    except Exception:
        db.rollback()
    try:
        from api.renewal_models import LeaseRenewal

        for r in db.scalars(select(LeaseRenewal).join(Building, LeaseRenewal.building_id == Building.id)
                            .where(Building.owner_id == link.owner_id, LeaseRenewal.stage == "awaiting_owner")).all():
            n.add(f"oren:{r.id}", "approval", "autorenew", "soon", ("تجديد عقد بانتظار قرارك", "A renewal needs your decision"),
                  None, r.updated_at, f"{base}/renewals", urgent=True)
    except Exception:
        db.rollback()


def collect(db: Session, user: User, locale: str) -> list[dict]:
    n = N(locale)
    loc = locale if locale in ("ar", "en") else "ar"
    if user.role == "tenant":
        base = f"/{loc}/tenant"
        _tenant(db, user, n, base)
        _tickets(db, user, n, base)
    elif user.role == "owner":
        base = f"/{loc}/owner"
        _owner(db, user, n, base)
        _tickets(db, user, n, base)
    else:
        base = f"/{loc}"
        for fn in (_attendance, _approvals, _tickets, _maintenance, _payments, _hr_requests, _hr_people, _leases):
            try:
                fn(db, user, n, base)
            except Exception:
                db.rollback()
    read = {k for (k,) in db.execute(select(NotificationRead.key).where(NotificationRead.user_id == user.id)).all()}
    for i in n.items:
        i["read"] = i["key"] in read
    # Unread urgent first, then unread, then read — newest first within each group.
    n.items.sort(key=lambda i: i["at"], reverse=True)
    n.items.sort(key=lambda i: (i["read"], not i["urgent"]))
    return n.items[:60]


@router.get("")
def list_notifications(db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    items = collect(db, user, locale)
    return {"items": items, "unread": sum(1 for i in items if not i["read"])}


class ReadIn(BaseModel):
    keys: list[str] = Field(default_factory=list, max_length=200)
    all: bool = False


@router.post("/read")
def mark_read(payload: ReadIn, db: DbSession, user: CurrentUser, locale: str = Query("ar", pattern="^(ar|en)$")):
    keys = set(k[:120] for k in payload.keys)
    if payload.all:
        keys |= {i["key"] for i in collect(db, user, locale)}
    have = {k for (k,) in db.execute(select(NotificationRead.key).where(NotificationRead.user_id == user.id, NotificationRead.key.in_(keys or {""}))).all()}
    for k in keys - have:
        db.add(NotificationRead(user_id=user.id, key=k))
    db.commit()
    return {"ok": True}

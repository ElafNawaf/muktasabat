"""HR attendance monitor — runs every 5 minutes inside the API process.

* no_checkin   — a working employee (not on leave) hasn't checked in
                 `checkin_reminder_minutes` after their start time → email them.
* left_area    — an office-day employee's portal reported them outside the
                 office for `left_alert_minutes` without checking out → email them.
* no_checkout  — still checked in `missing_checkout_minutes` after the end of
                 the working day → email them.
* auto_closed  — a day left open past midnight is closed at the last time the
                 employee was seen inside the office (office days) or the last
                 location report (remote/field) → email them.
* summary      — once a day, ~1 hour after start time, the HR approver gets
                 today's late / absent / remote list and yesterday's exceptions.

Each alert is claimed in hr_alert_log (unique per user/day/kind) before it is
sent, so restarts and overlapping runs never send twice.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta
from html import escape

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.database import SessionLocal
from api.hr_models import Attendance, HrAlertLog, HrProfile
from api.models import User

logger = logging.getLogger(__name__)


def _claim(db: Session, user_id: int, day: date, kind: str) -> bool:
    try:
        db.add(HrAlertLog(user_id=user_id, day=day, kind=kind))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _at(d: date, t: time, minutes: int) -> datetime:
    return datetime.combine(d, t) + timedelta(minutes=minutes)


def run_once(now: datetime | None = None) -> dict:
    from api.routers import hr

    now = now or hr.local_now()
    today = now.date()
    sent = {"no_checkin": 0, "left_area": 0, "no_checkout": 0, "auto_closed": 0, "summary": 0}
    with SessionLocal() as db:
        s = hr._settings(db)
        if today < s.attendance_from:
            return sent
        weekend = hr._weekend(s)
        profiles = {p.user_id: p for p in db.scalars(select(HrProfile)).all()}
        staff = hr._staff(db, working_only=True)
        url = f"{hr._base()}/ar/my-hr"

        # 1) close days left open (yesterday or earlier)
        for a in db.scalars(select(Attendance).where(Attendance.day < today, Attendance.check_in.is_not(None), Attendance.check_out.is_(None))).all():
            if a.last_inside_at is None and a.last_ping_at is None:  # recorded before location tracking existed
                p0 = profiles.get(a.user_id)
                end = datetime.combine(a.day, (p0.work_end if p0 and p0.work_end else s.work_end))
            else:
                end = (a.last_inside_at if a.mode == "office" else a.last_ping_at) or datetime.combine(a.day, a.check_in)
            if end.date() != a.day:
                end = datetime.combine(a.day, time(23, 59))
            a.check_out, a.auto_closed, a.source = end.time().replace(second=0, microsecond=0), True, "auto"
            a.note = ((a.note + " · ") if a.note else "") + "closed automatically"
            db.commit()
            u = db.get(User, a.user_id)
            if u and _claim(db, u.id, a.day, "auto_closed"):
                hr._send(u.email, [], f"لم تسجّل الانصراف {a.day} | You didn't check out on {a.day}",
                         f"<p>لم تسجّل انصرافك يوم {a.day}. أغلق النظام اليوم تلقائيًا عند آخر وقت كنت فيه في المكتب ({a.check_out.strftime('%H:%M')}). "
                         "إن كان هذا غير صحيح فتواصل مع الموارد البشرية لتعديله.</p>",
                         f"<p>You didn't check out on {a.day}. The day was closed automatically at the last time you were seen at the office "
                         f"({a.check_out.strftime('%H:%M')}). If that's wrong, ask HR to correct it.</p>", url, "خدماتي الوظيفية", "My HR")
                sent["auto_closed"] += 1

        if today.weekday() in weekend:
            return sent
        atts = {a.user_id: a for a in db.scalars(select(Attendance).where(Attendance.day == today)).all()}

        for u in staff:
            p = profiles.get(u.id)
            start = (p.work_start if p and p.work_start else s.work_start)
            end_t = (p.work_end if p and p.work_end else s.work_end)
            if hr._leave_on(db, u.id, today):
                continue
            a = atts.get(u.id)
            # 2) no check-in
            if (not a or not a.check_in) and _at(today, start, s.checkin_reminder_minutes) <= now < datetime.combine(today, end_t):
                if _claim(db, u.id, today, "no_checkin"):
                    hr._send(u.email, [], "تذكير: لم تسجّل حضورك اليوم | Reminder: you haven't checked in today",
                             f"<p>لم يُسجَّل حضورك اليوم (الدوام يبدأ {start.strftime('%H:%M')}). سجّل حضورك من خدماتي الوظيفية، "
                             "أو قدّم طلب إجازة أو عمل عن بُعد إن لم تكن في المكتب.</p>",
                             f"<p>You haven't checked in today (work starts at {start.strftime('%H:%M')}). Check in from My HR, "
                             "or raise a leave or remote-work request if you're not at the office.</p>", url, "تسجيل الحضور", "Check in")
                    sent["no_checkin"] += 1
                continue
            if not a or not a.check_in or a.check_out:
                continue
            # 3) left the office without checking out
            if a.mode == "office" and a.outside_since and (now - a.outside_since) >= timedelta(minutes=s.left_alert_minutes):
                if _claim(db, u.id, today, "left_area"):
                    t = a.outside_since.strftime("%H:%M")
                    hr._send(u.email, [], "يبدو أنك غادرت المكتب دون تسجيل الانصراف | You seem to have left the office without checking out",
                             f"<p>أظهر موقعك أنك خارج المكتب منذ {t}. إن كنت غادرت فسجّل الانصراف الآن؛ وإن كنت في مهمة عمل فقدّم طلب عمل ميداني ليُعتمد. "
                             "لا تُحتسب ساعات العمل بعد مغادرة المكتب.</p>",
                             f"<p>Your location shows you outside the office since {t}. If you've left, check out now; if you're on a work errand, "
                             "raise a field-work request for approval. Time after leaving the office isn't counted.</p>", url, "تسجيل الانصراف", "Check out")
                    sent["left_area"] += 1
            # 4) still checked in after hours
            if now >= _at(today, end_t, s.missing_checkout_minutes):
                if _claim(db, u.id, today, "no_checkout"):
                    hr._send(u.email, [], "تذكير: سجّل انصرافك | Reminder: check out",
                             f"<p>انتهى الدوام الساعة {end_t.strftime('%H:%M')} ولم تسجّل انصرافك بعد.</p>",
                             f"<p>The working day ended at {end_t.strftime('%H:%M')} and you haven't checked out yet.</p>", url, "تسجيل الانصراف", "Check out")
                    sent["no_checkout"] += 1

        # 5) daily summary to HR
        if s.daily_summary and now >= _at(today, s.work_start, s.grace_minutes + 60) and _claim(db, 0, today, "summary"):
            rows = [{"name": hr._uname(u, "ar"), "en": hr._uname(u, "en"),
                     **hr._day_status(db, s, profiles.get(u.id), u.id, today, atts.get(u.id), hr.now_riyadh())} for u in staff]
            def names(st, lang):
                return "، ".join(r["name"] if lang == "ar" else r["en"] for r in rows if r["status"] == st) or "—"
            remote = [r for r in rows if r["mode"] in ("remote", "field") and r["status"] in ("present", "late")]
            y = today - timedelta(days=1)
            ex = db.scalars(select(Attendance).where(Attendance.day == y, Attendance.auto_closed.is_(True))).all()
            ex_names = "، ".join(hr._uname(db.get(User, a.user_id), "ar") for a in ex) or "—"
            ex_en = ", ".join(hr._uname(db.get(User, a.user_id), "en") for a in ex) or "—"
            cnt = {k: sum(1 for r in rows if r["status"] == k) for k in ("present", "late", "absent", "on_leave")}
            body_ar = (f"<p>حضور اليوم {today}: حاضر {cnt['present']} · متأخر {cnt['late']} · غائب {cnt['absent']} · إجازة {cnt['on_leave']} · عن بُعد/ميداني {len(remote)}</p>"
                       f"<p><strong>المتأخرون:</strong> {escape(names('late', 'ar'))}</p><p><strong>لم يسجّلوا الحضور:</strong> {escape(names('absent', 'ar'))}</p>"
                       f"<p><strong>لم يسجّلوا الانصراف أمس (أُغلق تلقائيًا):</strong> {escape(ex_names)}</p>")
            body_en = (f"<p>Attendance {today}: present {cnt['present']} · late {cnt['late']} · absent {cnt['absent']} · on leave {cnt['on_leave']} · remote/field {len(remote)}</p>"
                       f"<p><strong>Late:</strong> {escape(names('late', 'en'))}</p><p><strong>Not checked in:</strong> {escape(names('absent', 'en'))}</p>"
                       f"<p><strong>Didn't check out yesterday (closed automatically):</strong> {escape(ex_en)}</p>")
            for a in hr._approvers(db):
                hr._send(a.email, [], f"ملخص الحضور {today} | Attendance summary {today}", body_ar, body_en,
                         f"{hr._base()}/ar/hr", "لوحة الموارد البشرية", "HR dashboard")
            sent["summary"] += 1
    return sent


async def monitor_loop(interval_seconds: int = 300, first_delay: int = 120) -> None:
    await asyncio.sleep(first_delay)  # never act from the deploy preflight container
    while True:
        try:
            await asyncio.to_thread(run_once)
        except Exception:  # noqa: BLE001
            logger.exception("hr monitor run failed")
        await asyncio.sleep(interval_seconds)

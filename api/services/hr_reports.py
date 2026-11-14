"""HR attendance: live status, monthly statistics and monthly report emails.

Monthly report: each employee gets their own month (summary + day by day)
To: the employee · Cc: the HR approver(s) (Mayaz) and the CEO (HR settings cc,
else PAYMENT_ALERTS_CC). HR approvers also get one company summary, CEO in Cc.
Sent automatically on the 1st of the month for the month before (see
api/services/hr_monitor.py) and on demand from the HR dashboard.
"""
from __future__ import annotations

import calendar
import math
from datetime import date, datetime, timedelta
from html import escape
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.email import EmailMessage, _branded, _button, send_email
from api.hr_models import Attendance, HrAlertLog, HrProfile, HrRequest, LocationPing
from api.models import User

MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]


def month_bounds(first: date) -> tuple[date, date]:
    return first, first.replace(day=calendar.monthrange(first.year, first.month)[1])


def prev_month(d: date) -> date:
    return (d.replace(day=1) - timedelta(days=1)).replace(day=1)


# ───────────────────────── live ─────────────────────────


def live(db: Session, locale: str) -> dict:
    from api.routers import hr

    s = hr._settings(db)
    now = hr.local_now()
    today = now.date()
    profiles = {p.user_id: p for p in db.scalars(select(HrProfile)).all()}
    atts = {a.user_id: a for a in db.scalars(select(Attendance).where(Attendance.day == today)).all()}
    last_ping: dict[int, LocationPing] = {}
    for pg in db.scalars(select(LocationPing).where(LocationPing.day == today).order_by(LocationPing.id)).all():
        last_ping[pg.user_id] = pg
    hr.seed_sites(db, s)
    from api.hr_models import HrWorkSite

    all_sites = {x.id: x for x in db.scalars(select(HrWorkSite).where(HrWorkSite.active.is_(True))).all()}
    stale_after = max(3 * s.ping_minutes, 15)
    people = []
    for u in hr._staff(db, working_only=True):
        p = profiles.get(u.id)
        a = atts.get(u.id)
        ds = hr._day_status(db, s, p, u.id, today, a, hr.now_riyadh())
        start = (p.work_start if p and p.work_start else s.work_start)
        if ds["status"] == "on_leave":
            st = "on_leave"
        elif a and a.check_in and a.check_out:
            st = "checked_out"
        elif a and a.check_in:
            st = ("away" if a.outside_since else "in_office") if a.mode == "office" else a.mode
        elif ds["status"] == "weekend":
            st = "weekend"
        elif ds["status"] == "untracked":
            st = "untracked"
        else:
            st = "absent" if ds["status"] == "absent" else "not_yet"
        pg = last_ping.get(u.id)
        seen = (a.last_ping_at if a and a.last_ping_at else (pg.at if pg else None))
        x = y = None
        site = None
        if pg and pg.lat is not None and pg.lng is not None:
            # Position relative to the employee's nearest allowed zone (for the per-zone radar).
            site, _d, _in = hr.nearest_site(hr.sites_for(db, s, p), pg.lat, pg.lng, pg.accuracy)
            if site is None and a and a.in_site_id in all_sites:
                site = all_sites[a.in_site_id]
            if site is not None:
                y = round((pg.lat - site.lat) * 111320, 1)
                x = round((pg.lng - site.lng) * 111320 * math.cos(math.radians(site.lat)), 1)
        elif a and a.in_site_id in all_sites:
            site = all_sites[a.in_site_id]
        if site is None and p is not None:
            mine = hr.sites_for(db, s, p)
            site = mine[0] if mine else None
        wl = hr.work_location_on(db, u.id, today)
        people.append({
            "user_id": u.id, "name": hr._uname(u, locale), "department": p.department if p else None,
            "job_title": (p.job_title if p and p.job_title else u.job_title), "status": st, "mode": ds["mode"],
            "check_in": ds.get("check_in"), "check_out": ds.get("check_out"), "late_minutes": ds["late_minutes"],
            "verified_minutes": ds.get("verified_minutes"), "away_minutes": ds.get("away_minutes") or 0,
            "outside_since": ds.get("outside_since"), "flags": ds.get("flags", []),
            "last_seen": seen.strftime("%H:%M") if seen else None,
            "minutes_since_seen": int((now - seen).total_seconds() // 60) if seen else None,
            "stale": bool(st == "in_office" and seen and (now - seen) > timedelta(minutes=stale_after)),
            "distance": pg.distance if pg else None, "inside": pg.inside if pg else None, "x": x, "y": y,
            "reading_kind": pg.kind if pg else None, "leave_type": ds.get("leave_type"),
            "work_location": hr._summary(wl, locale) if wl else None,
            "site_id": site.id if site else None,
        })
    order = {"away": 0, "absent": 1, "in_office": 2, "remote": 3, "field": 3, "not_yet": 4, "checked_out": 5, "on_leave": 6, "weekend": 7, "untracked": 8}
    people.sort(key=lambda r: (order.get(r["status"], 9), r["name"]))
    counts: dict[str, int] = {}
    for r in people:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {
        "now": now.strftime("%H:%M"), "date": today.isoformat(), "headcount": len(people), "counts": counts, "people": people,
        "office": {"lat": s.office_lat, "lng": s.office_lng, "radius": s.geofence_radius_m},
        "sites": [{"id": x.id, "name": hr.site_name(x, locale), "radius": x.radius_m, "lat": x.lat, "lng": x.lng} for x in all_sites.values()],
        "work": {"start": s.work_start.strftime("%H:%M"), "end": s.work_end.strftime("%H:%M")},
    }


# ───────────────────────── monthly statistics ─────────────────────────


def _totals(rows: list[dict]) -> dict:
    present = sum(r["present"] for r in rows)
    late = sum(r["late"] for r in rows)
    base = sum(max(0, r["working_days"] - r["on_leave"]) for r in rows)
    return {
        "attendance_pct": round(present / base * 100, 1) if base else None,
        "punctuality_pct": round((present - late) / present * 100, 1) if present else None,
        "verified_hours": round(sum(r["verified_hours"] for r in rows), 1),
        "worked_hours": round(sum(r["worked_hours"] for r in rows), 1),
        "late_minutes": sum(r["late_minutes"] for r in rows), "late_days": late,
        "absent_days": sum(r["absent"] for r in rows), "leave_days": sum(r["on_leave"] for r in rows),
        "remote_days": sum(r["remote_days"] + r["field_days"] for r in rows),
        "exceptions": sum(r["exceptions"] for r in rows), "present_days": present,
        "avg_actual_hours": round(sum(r["verified_hours"] for r in rows) / present, 1) if present else None,
    }


def stats(db: Session, first: date, locale: str) -> dict:
    from api.routers import hr

    s = hr._settings(db)
    today = hr.today_riyadh()
    _, last = month_bounds(first)
    last = min(last, today)
    staff = hr._staff(db, working_only=True)
    rows, days_by_user = [], {}
    for u in staff:
        row, days = hr.employee_month(db, s, u, first, last, locale)
        rows.append(row)
        days_by_user[u.id] = days
    series = []
    d = first
    while d <= last:
        key = d.isoformat()
        c = {"present": 0, "late": 0, "absent": 0, "on_leave": 0, "remote": 0}
        weekend = d.weekday() in hr._weekend(s)
        for uid, days in days_by_user.items():
            dd = next((x for x in days if x["day"] == key), None)
            if not dd:
                continue
            if dd["status"] in ("present", "late") and dd["mode"] in ("remote", "field"):
                c["remote"] += 1
            elif dd["status"] in c:
                c[dd["status"]] += 1
        series.append({"day": key, "weekend": weekend, **c})
        d += timedelta(days=1)
    # previous month for comparison
    pf = prev_month(first)
    _, pl = month_bounds(pf)
    prev_rows = [hr.employee_month(db, s, u, pf, pl, locale)[0] for u in staff] if pl >= s.attendance_from else []
    # leave by type and requests in month
    leave_by_type: dict[str, float] = {}
    for r in db.scalars(select(HrRequest).where(HrRequest.kind == "leave", HrRequest.status == "approved",
                                                HrRequest.start_date <= last, HrRequest.end_date >= first)).all():
        a, b = max(r.start_date, first), min(r.end_date, last)
        leave_by_type[r.leave_type or "other"] = leave_by_type.get(r.leave_type or "other", 0) + hr.working_days(a, b, hr._weekend(s))
    req = {}
    for r in db.scalars(select(HrRequest).where(HrRequest.created_at >= datetime.combine(first, datetime.min.time()),
                                                HrRequest.created_at < datetime.combine(last + timedelta(days=1), datetime.min.time()))).all():
        k = req.setdefault(r.kind, {"total": 0, "approved": 0, "rejected": 0, "pending": 0})
        k["total"] += 1
        key = "approved" if r.status in ("approved", "booked") else r.status
        if key in k:
            k[key] += 1
    def top(key, n=5, reverse=True, cond=lambda r: True):
        return [{"user_id": r["user_id"], "name": r["name"], "value": r[key]} for r in sorted([r for r in rows if cond(r)], key=lambda r: r[key] or 0, reverse=reverse)[:n] if (r[key] or 0) > 0]
    return {
        "month": first.strftime("%Y-%m"), "from": first.isoformat(), "to": last.isoformat(), "headcount": len(staff),
        "totals": _totals(rows), "prev": _totals(prev_rows) if prev_rows else None, "series": series, "rows": rows,
        "top_late": top("late_minutes"), "top_absent": top("absent"), "top_exceptions": top("exceptions"),
        "top_hours": top("verified_hours"),
        "leave_by_type": leave_by_type, "requests": req,
    }


# ───────────────────────── monthly report emails ─────────────────────────


def _m(n: int, ar: bool) -> str:
    h, m = divmod(int(n or 0), 60)
    if not h:
        return f"{m} د" if ar else f"{m}m"
    return (f"{h} س {m} د" if m else f"{h} س") if ar else (f"{h}h {m}m" if m else f"{h}h")


_DAY = {"present": ("حاضر", "Present", "#22663e"), "late": ("متأخر", "Late", "#8a5a00"), "absent": ("غائب", "Absent", "#9b2c1f"),
        "on_leave": ("إجازة", "Leave", "#1f4b99"), "weekend": ("عطلة", "Weekend", "#6b625a"), "not_yet": ("—", "—", "#6b625a"),
        "untracked": ("—", "—", "#6b625a")}
_FLAG = {"left_area": ("غادر دون انصراف", "Left without checking out"), "checked_out_away": ("انصراف بعيدًا عن المكتب", "Checked out away"),
         "auto_closed": ("أُغلق تلقائيًا", "Closed automatically"), "no_location": ("بدون موقع", "No location")}


def _tiles(cells: list[tuple[str, str, str]]) -> str:
    tds = "".join(
        f'<td style="padding:10px 8px;border:1px solid #eadfd3;border-radius:8px;text-align:center;background:#fbf8f4">'
        f'<div style="font-size:20px;font-weight:700;color:#1F2328">{escape(v)}</div>'
        f'<div style="font-size:12px;color:#6b625a">{escape(ar)}<br>{escape(en)}</div></td>'
        for v, ar, en in cells
    )
    return f'<table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="border-collapse:separate"><tr>{tds}</tr></table>'


def employee_email(row: dict, days: list[dict], first: date, url: str) -> tuple[str, str, str]:
    label_ar = f"{MONTHS_AR[first.month - 1]} {first.year}"
    label_en = first.strftime("%B %Y")
    pct = f"{row['attendance_pct']:g}%"
    tiles1 = _tiles([
        (pct, "نسبة الحضور", "Attendance"), (str(row["present"]), "أيام الحضور", "Days present"),
        (str(row["late"]), "أيام التأخير", "Late days"), (str(row["absent"]), "أيام الغياب", "Absent days"),
    ])
    tiles2 = _tiles([
        (f"{row['verified_hours']:g}", "الساعات الفعلية", "Actual hours"), (f"{row['worked_hours']:g}", "الساعات المسجّلة", "Recorded hours"),
        (str(row["on_leave"]), "أيام الإجازة", "Leave days"), (str(row["remote_days"] + row["field_days"]), "عن بُعد / ميداني", "Remote / field"),
    ])
    extra_ar = (f"<p style='margin:8px 0'>إجمالي التأخير: <strong>{_m(row['late_minutes'], True)}</strong> · الاستئذانات: {_m(row['permission_minutes'], True)}"
                f" · وقت خارج المكتب: {_m(row['away_minutes'], True)} · ملاحظات الحضور: {row['exceptions']}"
                + (f" · متوسط وقت الحضور: {row['avg_check_in']}" if row.get("avg_check_in") else "") + "</p>")
    extra_en = (f"<p style='margin:8px 0'>Total lateness: <strong>{_m(row['late_minutes'], False)}</strong> · Permissions: {_m(row['permission_minutes'], False)}"
                f" · Time away from the office: {_m(row['away_minutes'], False)} · Attendance exceptions: {row['exceptions']}"
                + (f" · Average check-in: {row['avg_check_in']}" if row.get("avg_check_in") else "") + "</p>")
    th = 'style="padding:6px 8px;border-bottom:2px solid #eadfd3;font-size:12px;color:#6b625a;text-align:start"'
    trs = []
    for d in days:
        if d["status"] in ("not_yet", "untracked"):
            continue
        ar_s, en_s, color = _DAY.get(d["status"], ("", "", "#6b625a"))
        mode = {"remote": " · عن بُعد / Remote", "field": " · ميداني / Field"}.get(d.get("mode") or "", "")
        flags = "، ".join(f"{_FLAG[f][0]} / {_FLAG[f][1]}" for f in d.get("flags", []) if f in _FLAG)
        late = _m(d["late_minutes"], False) if d["late_minutes"] else ""
        td = 'style="padding:6px 8px;border-bottom:1px solid #f0e8de;font-size:12.5px;white-space:nowrap"'
        trs.append(
            f"<tr><td {td}>{d['day'][8:]}</td><td {td}><span style='color:{color};font-weight:700'>{ar_s} / {en_s}</span>{mode}</td>"
            f"<td {td} dir='ltr'>{d.get('check_in') or '—'}</td><td {td} dir='ltr'>{d.get('check_out') or '—'}</td>"
            f"<td {td}>{late}</td><td {td}>{_m(d['verified_minutes'], False) if d.get('verified_minutes') else ''}</td>"
            f"<td {td} style='color:#9b2c1f;font-size:12px'>{escape(flags)}</td></tr>"
        )
    table = (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px">'
        f"<tr><th {th}>اليوم<br>Day</th><th {th}>الحالة<br>Status</th><th {th}>حضور<br>In</th><th {th}>انصراف<br>Out</th>"
        f"<th {th}>تأخير<br>Late</th><th {th}>فعلي<br>Actual</th><th {th}>ملاحظات<br>Notes</th></tr>" + "".join(trs) + "</table>"
    )
    name = escape(row["name"])
    ar = (f"<p>مرحبًا {name}،</p><p>هذا تقرير حضورك لشهر <strong>{label_ar}</strong>.</p>{tiles1}{tiles2}{extra_ar}{table}"
          "<p style='font-size:12px;color:#6b625a'>الساعات الفعلية تُحتسب من الحضور حتى مغادرة نطاق المكتب، بعد خصم الوقت خارجه. "
          "لأي تصحيح تواصل مع الموارد البشرية.</p>" + _button(url, "خدماتي الوظيفية"))
    en = (f"<p>Hello {name},</p><p>Here is your attendance for <strong>{label_en}</strong>.</p>{extra_en}"
          "<p style='font-size:12px;color:#6b625a'>The figures and the day-by-day table are in the section above. Actual hours run from check-in "
          "until you left the office area, minus time spent outside it. Contact HR for any correction.</p>" + _button(url, "My HR"))
    subject = f"تقرير الحضور {label_ar} — {row['name']} | Attendance report {label_en}"
    return subject, ar, en


def company_email(st: dict, first: date, url: str) -> tuple[str, str, str]:
    label_ar = f"{MONTHS_AR[first.month - 1]} {first.year}"
    label_en = first.strftime("%B %Y")
    t = st["totals"]
    def f(v, suf=""):
        return "—" if v is None else f"{v:g}{suf}"
    tiles = _tiles([(f(t["attendance_pct"], "%"), "نسبة الحضور", "Attendance"), (f(t["punctuality_pct"], "%"), "الالتزام بالوقت", "On time"),
                    (f(t["verified_hours"]), "الساعات الفعلية", "Actual hours"), (str(t["absent_days"]), "أيام الغياب", "Absent days")])
    th = 'style="padding:6px 8px;border-bottom:2px solid #eadfd3;font-size:12px;color:#6b625a;text-align:start"'
    td = 'style="padding:6px 8px;border-bottom:1px solid #f0e8de;font-size:12.5px;white-space:nowrap"'
    trs = "".join(
        f"<tr><td {td}>{escape(r['name'])}</td><td {td}>{r['attendance_pct']:g}%</td><td {td}>{r['present']}</td><td {td}>{r['late']} ({_m(r['late_minutes'], False)})</td>"
        f"<td {td}>{r['absent']}</td><td {td}>{r['on_leave']}</td><td {td}>{r['worked_hours']:g} / <strong>{r['verified_hours']:g}</strong></td><td {td}>{r['exceptions']}</td></tr>"
        for r in sorted(st["rows"], key=lambda r: r["attendance_pct"])
    )
    table = ('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px">'
             f"<tr><th {th}>الموظف<br>Employee</th><th {th}>الحضور<br>Att.</th><th {th}>أيام<br>Days</th><th {th}>تأخير<br>Late</th>"
             f"<th {th}>غياب<br>Absent</th><th {th}>إجازة<br>Leave</th><th {th}>ساعات مسجّلة / فعلية<br>Hours rec. / actual</th><th {th}>ملاحظات<br>Exc.</th></tr>{trs}</table>")
    ar = (f"<p>ملخص حضور الشركة لشهر <strong>{label_ar}</strong> ({st['headcount']} موظف). أُرسل لكل موظف تقريره مع نسخة لكم.</p>{tiles}{table}"
          + _button(url, "لوحة الحضور"))
    en = (f"<p>Company attendance for <strong>{label_en}</strong> ({st['headcount']} employees). Each employee received their own report, copied to you. "
          "The table is in the section above.</p>" + _button(url, "Attendance dashboard"))
    return f"ملخص حضور الشركة {label_ar} | Company attendance {label_en}", ar, en


def _claim(db: Session, user_id: int, day: date, kind: str) -> bool:
    try:
        db.add(HrAlertLog(user_id=user_id, day=day, kind=kind))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def send_monthly(db: Session, first: date, user_ids: Optional[list[int]] = None, resend: bool = False) -> dict:
    """Email each employee their month (Cc HR approvers + CEO), then the company summary."""
    from api.routers import hr

    s = hr._settings(db)
    _, last = month_bounds(first)
    last = min(last, hr.today_riyadh())
    approver_emails = [a.email for a in hr._approvers(db) if a.email]
    ceo = hr._cc(db)
    base = hr._base()
    out = {"sent": 0, "skipped": 0, "no_email": 0, "summary": False}
    if month_bounds(first)[1] >= hr.today_riyadh():
        resend = True  # month not over yet: an interim report, never blocks the full-month report on the 1st
    for u in hr._staff(db, working_only=True):
        if user_ids and u.id not in user_ids:
            continue
        if not u.email:
            out["no_email"] += 1
            continue
        if not resend and not _claim(db, u.id, first, "monthly_report"):
            out["skipped"] += 1
            continue
        row, days = hr.employee_month(db, s, u, first, last, "ar")
        row_en = dict(row, name=hr._uname(u, "en"))
        row["name"] = f"{row['name']}" if row["name"] == row_en["name"] else f"{row['name']} ({row_en['name']})"
        subject, ar, en = employee_email(row, days, first, f"{base}/ar/my-hr")
        cc = [c for c in dict.fromkeys(approver_emails + ceo) if c and c.lower() != u.email.lower()]
        send_email(EmailMessage(to=u.email, cc=cc or None, subject=subject, text_body=subject,
                                html_body=_branded(ar, en, preheader=subject), category="hr"))
        out["sent"] += 1
    if not user_ids and (resend or _claim(db, 0, first, "monthly_summary")):
        st = stats(db, first, "ar")
        subject, ar, en = company_email(st, first, f"{base}/ar/hr/attendance")
        for to in approver_emails or ceo[:1]:
            send_email(EmailMessage(to=to, cc=[c for c in ceo if c != to] or None, subject=subject, text_body=subject,
                                    html_body=_branded(ar, en, preheader=subject), category="hr"))
        out["summary"] = True
    return out

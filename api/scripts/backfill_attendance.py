"""Backfill attendance: one full day (default 8 h from the employee's work
start) on every working day in a date range, for the staff listed on stdin.

stdin: the same JSON list as import_staff (only "email" is used), kept out of
the repo because it holds personal data.
Skips weekends (HR settings), days on approved leave and days that already
have a record, so real check-ins are never overwritten and re-running is safe.
Records are marked source="manual" with a note so they're recognisable.
Prints counts only.

  docker compose exec -T api python -m api.scripts.backfill_attendance \
      --from 2026-01-01 --to 2026-11-15 [--hours 8] [--dry-run] < staff.json
"""
import argparse
import json
import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from api.database import SessionLocal
from api.hr_models import Attendance, HrProfile, HrSettings
from api.models import User
from api.routers.hr import _leave_on, _weekend

NOTE = "Backfilled attendance (full day)"


def realistic_day(user_id: int, d: date, start: time, hours: float) -> tuple[time, time]:
    """A believable day around the schedule, the same every run for this person and date:
    arrival mostly 15 min early to 10 min after the start (about 1 day in 15 a little late),
    a working day of `hours` give or take ~15 min."""
    rnd = random.Random(f"{user_id}:{d.isoformat()}")
    base = start.hour * 60 + start.minute
    if rnd.random() < 0.065:
        arrive = base + rnd.randint(16, 38)
    else:
        arrive = base + int(max(-22, min(12, rnd.gauss(-5, 7))))
    length = int(max(hours * 60 - 30, min(hours * 60 + 40, rnd.gauss(hours * 60 + 4, 14))))
    leave = arrive + length
    return time(arrive // 60, arrive % 60), time(min(23, leave // 60), leave % 60 if leave // 60 < 24 else 59)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--hours", type=float, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rewrite", action="store_true", help="re-time rows this script added earlier (never real check-ins)")
    a = ap.parse_args()
    start, end = date.fromisoformat(a.start), date.fromisoformat(a.end)
    emails = [(r.get("email") or "").strip().lower() for r in json.load(sys.stdin)]
    db = SessionLocal()
    stats = {"rewritten": 0, "people": 0, "not_found": 0, "added": 0, "already_had_record": 0, "on_leave": 0, "weekend_days_skipped": 0}
    try:
        s = db.get(HrSettings, 1)
        weekend = _weekend(s) if s else {4, 5}
        default_start = s.work_start if s else time(9, 0)
        missing_rows = []
        for i, email in enumerate(emails, 1):
            if not email:
                continue
            u = db.scalar(select(User).where(func.lower(User.email) == email))
            if u is None:
                stats["not_found"] += 1
                missing_rows.append(i)  # list position only — no personal data in the log
                continue
            stats["people"] += 1
            p = db.scalar(select(HrProfile).where(HrProfile.user_id == u.id))
            sched = (p.work_start if p and p.work_start else default_start)
            existing = db.scalars(select(Attendance).where(Attendance.user_id == u.id, Attendance.day >= start, Attendance.day <= end)).all()
            have = {x.day for x in existing}
            if a.rewrite:
                for x in existing:
                    if x.note == NOTE and x.edited_by == "backfill" and x.day.weekday() not in weekend:
                        x.check_in, x.check_out = realistic_day(u.id, x.day, sched, a.hours)
                        stats["rewritten"] += 1
            d = start
            while d <= end:
                if d.weekday() in weekend:
                    stats["weekend_days_skipped"] += 1
                elif d in have:
                    stats["already_had_record"] += 1
                elif _leave_on(db, u.id, d):
                    stats["on_leave"] += 1
                else:
                    t_in, t_out = realistic_day(u.id, d, sched, a.hours)
                    db.add(Attendance(user_id=u.id, day=d, check_in=t_in, check_out=t_out, source="manual",
                                      mode="office", note=NOTE, edited_by="backfill"))
                    stats["added"] += 1
                d += timedelta(days=1)
        if a.dry_run:
            db.rollback()
        else:
            db.commit()
        print(("DRY RUN — nothing saved. " if a.dry_run else "Saved. ") + json.dumps(
            {**stats, "missing_list_rows": missing_rows, "range": f"{start}..{end}", "hours": a.hours, "weekend": sorted(weekend), "work_start_default": default_start.strftime("%H:%M")}))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

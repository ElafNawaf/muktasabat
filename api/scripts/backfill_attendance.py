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
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from api.database import SessionLocal
from api.hr_models import Attendance, HrProfile, HrSettings
from api.models import User
from api.routers.hr import _leave_on, _weekend

NOTE = "Backfilled attendance (full day)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--hours", type=float, default=8)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    start, end = date.fromisoformat(a.start), date.fromisoformat(a.end)
    emails = [(r.get("email") or "").strip().lower() for r in json.load(sys.stdin)]
    db = SessionLocal()
    stats = {"people": 0, "not_found": 0, "added": 0, "already_had_record": 0, "on_leave": 0, "weekend_days_skipped": 0}
    try:
        s = db.get(HrSettings, 1)
        weekend = _weekend(s) if s else {4, 5}
        default_start = s.work_start if s else time(9, 0)
        for email in filter(None, emails):
            u = db.scalar(select(User).where(func.lower(User.email) == email))
            if u is None:
                stats["not_found"] += 1
                continue
            stats["people"] += 1
            p = db.scalar(select(HrProfile).where(HrProfile.user_id == u.id))
            t_in = (p.work_start if p and p.work_start else default_start)
            t_out = (datetime.combine(start, t_in) + timedelta(hours=a.hours)).time()
            have = set(db.scalars(select(Attendance.day).where(Attendance.user_id == u.id, Attendance.day >= start, Attendance.day <= end)).all())
            d = start
            while d <= end:
                if d.weekday() in weekend:
                    stats["weekend_days_skipped"] += 1
                elif d in have:
                    stats["already_had_record"] += 1
                elif _leave_on(db, u.id, d):
                    stats["on_leave"] += 1
                else:
                    db.add(Attendance(user_id=u.id, day=d, check_in=t_in, check_out=t_out, source="manual",
                                      mode="office", note=NOTE, edited_by="backfill"))
                    stats["added"] += 1
                d += timedelta(days=1)
        if a.dry_run:
            db.rollback()
        else:
            db.commit()
        print(("DRY RUN — nothing saved. " if a.dry_run else "Saved. ") + json.dumps(
            {**stats, "range": f"{start}..{end}", "hours": a.hours, "weekend": sorted(weekend), "work_start_default": default_start.strftime("%H:%M")}))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

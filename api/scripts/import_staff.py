"""Add or update staff accounts as employees of a group company.

Reads a JSON list on stdin (kept out of the repo — it holds personal data):
  [{"name_ar": "...", "email": "...", "phone": "+9665...", "company": "EL"|"MK"}, ...]
`company` is a company short code (EL = Eloo Elevators, MK = Muktasabat).

Per person: finds the user by email (case-insensitive) or creates one with a
random password (they set their own through an invitation / reset link later),
gives role `employee` unless they already have a higher role, fills empty
name / phone, and puts their HR profile under the company.
Prints counts only — never names, emails or phones (the Actions log is public).

Run on the server:  docker compose exec -T api python -m api.scripts.import_staff < staff.json
Add --dry-run to report what would change without saving.
"""
import json
import re
import secrets
import sys

from sqlalchemy import func, select

from api.database import SessionLocal
from api.hr_models import HrProfile
from api.hr_people_models import HrCompany
from api.models import User


def _username(db, email: str) -> str:
    base = re.sub(r"[^a-z0-9._-]", "", email.split("@")[0].lower())[:60] or "staff"
    name, n = base, 1
    while db.scalar(select(User.id).where(User.username == name)):
        n += 1
        name = f"{base}{n}"
    return name


def main() -> int:
    dry = "--dry-run" in sys.argv
    rows = json.load(sys.stdin)
    db = SessionLocal()
    stats = {"created": 0, "existing": 0, "role_set": 0, "company_set": 0, "skipped": 0}
    try:
        from api.routers.hr_people import seed_companies
        seed_companies(db)
        companies = {c.short_code: c for c in db.scalars(select(HrCompany)).all() if c.short_code}
        for r in rows:
            email = (r.get("email") or "").strip().lower()
            comp = companies.get((r.get("company") or "").upper())
            if not email or comp is None:
                stats["skipped"] += 1
                continue
            user = db.scalar(select(User).where(func.lower(User.email) == email))
            if user is None:
                user = User(username=_username(db, email), email=email, role="employee", is_active_user=True, email_verified=True)
                user.set_password(secrets.token_urlsafe(24))
                db.add(user)
                db.flush()
                stats["created"] += 1
            else:
                stats["existing"] += 1
                if user.role in (None, "", "viewer"):
                    user.role = "employee"
                    stats["role_set"] += 1
            if r.get("name_ar") and not user.full_name_ar:
                user.full_name_ar = r["name_ar"].strip()
            if r.get("phone") and not user.phone:
                user.phone = r["phone"].strip()
            prof = db.scalar(select(HrProfile).where(HrProfile.user_id == user.id))
            if prof is None:
                prof = HrProfile(user_id=user.id)
                db.add(prof)
            if prof.company_id != comp.id:
                prof.company_id = comp.id
                stats["company_set"] += 1
        per_company = {}
        for r in rows:
            per_company[(r.get("company") or "?").upper()] = per_company.get((r.get("company") or "?").upper(), 0) + 1
        if dry:
            db.rollback()
        else:
            db.commit()
        print(("DRY RUN — nothing saved. " if dry else "Saved. ") + json.dumps({**stats, "people_per_company": per_company}))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

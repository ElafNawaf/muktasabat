"""Import employees from the government establishment list (Qiwa / GOSI style:
ID number, name, nationality, job, gender, date of birth, notes).

stdin: JSON list of
  {"id_number", "name", "nationality", "job_title", "gender": "male|female",
   "dob": "YYYY-MM-DD"|"", "note", "company": "EL"|"MK", "email"?: ""}
(kept out of the repo — it holds personal data).

Matching, in order: HR personal file with the same ID number → account with
the same email → an existing staff account whose Arabic name has the same
first and last name (e.g. "ريم الحربي" ↔ "ريم موسى عوض الحربي"). Existing
people are completed (empty fields filled; ID/DOB/gender/nationality/job set),
never downgraded. New people get an employee account with no login yet
(random password, placeholder address on the reserved .invalid domain, so
nothing is ever emailed) until HR adds their real email and invites them.
Prints counts only.
"""
import json
import re
import secrets
import sys
from datetime import date

from sqlalchemy import func, select

from api.database import SessionLocal
from api.hr_models import HrProfile
from api.hr_people_models import HrCompany, HrPersonal
from api.models import User

AR = re.compile(r"[؀-ۿ]")


def _norm(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    return s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")


def _parts(name: str) -> list[str]:
    return [t for t in _norm(name).split(" ") if t and t not in ("بن", "بنت")]


def main() -> int:
    dry = "--dry-run" in sys.argv
    rows = json.load(sys.stdin)
    db = SessionLocal()
    st = {"matched_by_id": 0, "matched_by_email": 0, "matched_by_name": 0, "created": 0, "skipped": 0}
    try:
        from api.routers.hr_people import seed_companies
        seed_companies(db)
        comps = {c.short_code: c for c in db.scalars(select(HrCompany)).all() if c.short_code}
        staff = [u for u in db.scalars(select(User)).all() if u.role not in ("owner", "tenant")]
        n_new = db.scalar(select(func.count()).select_from(User).where(User.username.like("emp%"))) or 0
        for r in rows:
            idn = re.sub(r"\D", "", str(r.get("id_number") or ""))
            name = re.sub(r"\s+", " ", (r.get("name") or "").strip())
            comp = comps.get((r.get("company") or "").upper())
            if not name or comp is None:
                st["skipped"] += 1
                continue
            is_ar = bool(AR.search(name))
            user = None
            if idn:
                pf = db.scalar(select(HrPersonal).where(HrPersonal.id_number == idn))
                if pf:
                    user = db.get(User, pf.user_id)
                    st["matched_by_id"] += 1 if user else 0
            if user is None and r.get("email"):
                user = db.scalar(select(User).where(func.lower(User.email) == r["email"].strip().lower()))
                st["matched_by_email"] += 1 if user else 0
            if user is None and is_ar:
                p = _parts(name)
                cands = [u for u in staff if u.full_name_ar and (q := _parts(u.full_name_ar)) and q[0] == p[0] and q[-1] == p[-1]]
                if len(cands) == 1:
                    user = cands[0]
                    st["matched_by_name"] += 1
            if user is None:
                n_new += 1
                uname = f"emp{n_new:03d}"
                while db.scalar(select(User.id).where(User.username == uname)):
                    n_new += 1
                    uname = f"emp{n_new:03d}"
                user = User(username=uname, email=(r.get("email") or f"{uname}@no-email.invalid").strip().lower(), role="employee",
                            is_active_user=True, email_verified=False)
                user.set_password(secrets.token_urlsafe(24))
                db.add(user)
                db.flush()
                staff.append(user)
                st["created"] += 1
            elif user.role in (None, "", "viewer"):
                user.role = "employee"
            # Account: full official name and job
            if is_ar:
                user.full_name_ar = name
            else:
                user.full_name = name.title()
            if r.get("job_title"):
                user.job_title = r["job_title"]
            # HR profile
            prof = db.scalar(select(HrProfile).where(HrProfile.user_id == user.id))
            if prof is None:
                prof = HrProfile(user_id=user.id)
                db.add(prof)
            prof.company_id = comp.id
            if r.get("job_title"):
                prof.job_title = r["job_title"]
            if r.get("nationality"):
                prof.nationality = r["nationality"]
            if r.get("note") and r["note"] not in (prof.notes or ""):
                prof.notes = ((prof.notes + "\n") if prof.notes else "") + r["note"]
            # Personal file
            pf = db.scalar(select(HrPersonal).where(HrPersonal.user_id == user.id))
            if pf is None:
                pf = HrPersonal(user_id=user.id)
                db.add(pf)
            t = name.split(" ")
            toks = [x for x in t if x not in ("بن", "بنت")]
            if is_ar:
                pf.first_name_ar, pf.family_name_ar = toks[0], toks[-1]
                if len(toks) > 2:
                    pf.father_name_ar = toks[1]
            else:
                pf.first_name_en, pf.family_name_en = toks[0].title(), toks[-1].title()
            if idn:
                pf.id_number = idn
                pf.id_type = "national_id" if idn.startswith("1") else "iqama"
            if r.get("gender") in ("male", "female"):
                pf.gender = r["gender"]
            if r.get("dob"):
                try:
                    pf.date_of_birth = date.fromisoformat(r["dob"])
                except ValueError:
                    pass
            pf.updated_by = "import"
        if dry:
            db.rollback()
        else:
            db.commit()
        print(("DRY RUN — nothing saved. " if dry else "Saved. ") + json.dumps({**st, "rows": len(rows)}))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

#!/bin/bash
# Seed employee test data for Elaf (idempotent). Prints counts/ids only.
docker exec -i muktasabat-api-1 python - <<'PY' 2>&1 | grep -v '"ts":' | tail -20
"""Seed employee test data for Elaf's account (idempotent). Prints counts/ids only — the repo is public."""
from datetime import date, timedelta
from sqlalchemy import func, or_, select
from api.database import SessionLocal
from api.models import User
from api.hr_people_models import HrAsset, HrContract
from api.routers import hr_people as hp
from api.services.hr_contract_docs import seed_templates, template_for

TAG = "بيانات تجريبية للاختبار — TEST DATA"
db = SessionLocal()
cands = db.scalars(select(User).where(User.is_active_user.is_(True), or_(func.lower(User.username).like("elaf%"), func.lower(User.full_name).like("elaf%")))).all()
print("candidates:", len(cands))
if len(cands) != 1:
    raise SystemExit("expected exactly one Elaf account — stopping")
me = cands[0]
actor = db.scalar(select(User).where(User.username == "admin", User.is_active_user.is_(True))) or \
        db.scalar(select(User).where(User.role == "admin", User.id != me.id, User.is_active_user.is_(True)))
if actor is None:
    raise SystemExit("no admin actor — stopping")
print("employee id:", me.id, "role:", me.role, "| actor id:", actor.id)
hp.seed_companies(db); seed_templates(db)
prof = hp._profile(db, me.id); db.commit()

# 1) Employment contract waiting for acceptance (from the default template)
c = db.scalar(select(HrContract).where(HrContract.user_id == me.id, HrContract.terms == TAG))
if c is None:
    t = template_for(db, prof.company_id, "fixed")
    start = date.today().replace(day=1) + timedelta(days=32)
    start = start.replace(day=1)
    payload = hp.ContractIn(user_id=me.id, company_id=prof.company_id, contract_type="fixed", job_title=None,
        start_date=start, end_date=date(start.year + 1, start.month, 1) - timedelta(days=1), probation_end=start + timedelta(days=89),
        basic_salary=15000, housing_allowance=3750, transport_allowance=1500, other_allowance=500, other_allowance_label="بدل اتصال",
        working_hours_week=48, annual_leave_days=21, notice_days=60, terms=TAG, template_id=t.id if t else None)
    out = hp.create_contract(payload, db, actor, "ar")
    hp.send_contract(out["id"], db, actor, "ar")
    c = db.get(HrContract, out["id"])
    print("contract created:", c.id, c.number, c.status, "template:", c.template_id)
else:
    print("contract exists:", c.id, c.number, c.status)

# 2) Assets waiting for receipt confirmation
for kind, name, model, serial, value in (("laptop", "حاسب محمول (تجريبي)", "MacBook Pro 14 M3", "TEST-LAP-001", 9500),
                                          ("phone", "جوال العمل (تجريبي)", "iPhone 15", "TEST-PH-001", 4200),
                                          ("cash", "عهدة نقدية للمصروفات (تجريبية)", None, None, 1000)):
    a = db.scalar(select(HrAsset).where(HrAsset.name == name, HrAsset.assigned_user_id == me.id))
    if a:
        print("asset exists:", a.id, a.tag); continue
    out = hp.create_asset(hp.AssetIn(kind=kind, name=name, brand_model=model, serial=serial, value=value, notes=TAG), db, actor, "ar")
    hp.assign_asset(out["id"], hp.AssignIn(user_id=me.id, note=TAG), db, actor, "ar")
    print("asset assigned:", out["id"], out["tag"])
print("done")
PY

#!/bin/bash
# Assign Elaf as the responsible employee of ONE property (one with nobody assigned,
# when possible) and send a single [TEST] payment alert for one of its instalments.
cat /home/ubuntu/muktasabat/.last_deployed_sha
docker exec -i muktasabat-api-1 python - <<'PY'
from datetime import date
from sqlalchemy import func, or_, select
from api.config import get_settings
from api.database import SessionLocal
from api.email import last_send_error, send_email
from api.models import Building, Contract, Payment, Unit, User
from api.services import payment_alerts as pa

s = get_settings()
print("alerts enabled:", s.payment_alerts_enabled, "| CC configured:", bool(s.payment_alerts_cc.strip()),
      "| SES:", bool(s.ses_region and s.ses_from_email))
with SessionLocal() as db:
    elaf = db.scalars(select(User).where(or_(func.lower(User.email).like("elaf.nawaf%"),
                                             func.lower(User.username).like("elaf%")))
                      .where(User.is_active_user.is_(True))).all()
    print("tester accounts found:", [(u.id, u.username, u.email, u.role) for u in elaf])
    if not elaf:
        raise SystemExit("no Elaf account")
    elaf = sorted(elaf, key=lambda u: (u.role != "admin", u.id))[0]

    # Lease instalments, nearest upcoming unpaid first, then anything.
    today = pa.riyadh_today()
    q = select(Payment).join(Payment.contract).where(Contract.tenant_id.is_not(None))
    pays = db.scalars(q).all()
    print("lease instalments in DB:", len(pays))
    if not pays:
        raise SystemExit("no lease payments to test with")
    def rank(p):
        b = p.contract.unit.building
        return (b.assignee_id not in (None, elaf.id), p.status == "paid", p.due_date < today, abs((p.due_date - today).days))
    p = sorted(pays, key=rank)[0]
    b = p.contract.unit.building
    prev = b.assignee_id
    b.assignee_id = elaf.id
    db.commit()
    print(f"property #{b.id} '{b.name}': responsible changed {prev} -> {elaf.id} ({elaf.username})")

    p = pa._load(db, p.id)
    off = (p.due_date - today).days
    kind = "tenant_due" if off >= 0 else ("tenant_overdue" if p.status != "paid" else "tenant_paid")
    rcpt = pa.recipients_for(p)
    msg = pa.build_email(p, kind, -off, rcpt, today)
    msg.subject = "[تجربة | TEST] " + msg.subject
    msg.cc = None  # CC address not yet verified in SES (sandbox)
    ok = send_email(msg)
    print(f"test alert: contract {p.contract.contract_number}, instalment due {p.due_date}, kind={kind}")
    print("  to:", msg.to, "| cc:", msg.cc, "| delivered:", ok, "| error:", last_send_error())
    print("scheduler would send today:", len(pa.run_alerts(db, dry_run=True)), "alert(s)")
PY

"""Smoke test for the payment-timeline alerts.

    DATABASE_URL="sqlite:////tmp/alerts.db" SECRET_KEY=x PAYMENT_ALERTS_CC=ceo@example.com \
        python3 scripts/test_payment_alerts.py [--html /tmp/alert.html]

Walks one instalment through its whole timeline (early alerts → due today →
overdue → received → owner payout due → owner paid) and checks recipients,
de-duplication and the catch-up window. Captures e-mails instead of sending.
"""
from __future__ import annotations

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db_url = os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/alerts_test.db")
if db_url.startswith("sqlite:////"):
    path = db_url.replace("sqlite:///", "")
    if os.path.exists(path):
        os.remove(path)
os.environ.setdefault("PAYMENT_ALERTS_CC", "ceo@example.com")

import api.models  # noqa: E402,F401
from api.database import Base, SessionLocal, engine  # noqa: E402
from api.models import Building, Contract, Employee, Owner, Payment, Tenant, Unit, User  # noqa: E402
from api.services import payment_alerts as pa  # noqa: E402

Base.metadata.create_all(bind=engine)
sent: list = []
pa.send_email = lambda msg: sent.append(msg) or True  # capture

html_out = sys.argv[sys.argv.index("--html") + 1] if "--html" in sys.argv else None
D1 = date(2026, 12, 1)


def seed(db):
    staff = User(username="sara", email="Sara@Muktasabat.com", role="employee")
    staff.set_password("x")
    db.add(staff)
    db.flush()
    db.add(Employee(user_id=staff.id, name="سارة القحطاني"))
    owner = Owner(name="عبدالله المالك", bank_name="الراجحي", iban="SA0380000000608010167519")
    db.add(owner)
    db.flush()
    b1 = Building(owner_id=owner.id, name="برج الياسمين", name_en="Yasmin Tower", assignee_id=staff.id)
    b2 = Building(owner_id=owner.id, name="فيلا النخيل", name_en="Palm Villa")  # nobody assigned
    db.add_all([b1, b2])
    db.flush()
    u1 = Unit(building_id=b1.id, name="شقة", name_en="Flat", number="A-12", management_percentage=5, ejar_fee=0)
    u2 = Unit(building_id=b2.id, name="فيلا", name_en="Villa", number="V-1")
    db.add_all([u1, u2])
    t = Tenant(name="محمد المستأجر", phone="0500000000", national_id="1000000000")
    db.add(t)
    db.flush()
    c1 = Contract(unit_id=u1.id, tenant_id=t.id, contract_number="L-2026-001", ejar_contract_number="10512345678",
                  start_date=D1, end_date=D1 + timedelta(days=364), rent_amount=10000, total_rent_amount=40000,
                  payment_cycle=3, payment_count=4, payment_type="quarterly")
    c2 = Contract(unit_id=u2.id, tenant_id=t.id, contract_number="L-2026-002",
                  start_date=D1, end_date=D1 + timedelta(days=364), rent_amount=5000, payment_cycle=12)
    db.add_all([c1, c2])
    db.flush()
    for i in range(4):
        db.add(Payment(contract_id=c1.id, amount=10000, due_date=date(2026, 12 + 0, 1) if i == 0 else date(2027, 3 * i, 1)))
    db.add(Payment(contract_id=c2.id, amount=5000, due_date=D1 + timedelta(days=2)))
    # Long-forgotten unpaid instalment: must NOT alert (outside catch-up window)
    db.add(Payment(contract_id=c2.id, amount=5000, due_date=D1 - timedelta(days=90)))
    db.commit()
    return c1.payments[0].id


def run(db, day):
    n = len(sent)
    rows = pa.run_alerts(db, today=day)
    return [(r["kind"], r["stage"], r["contract_number"]) for r in rows], sent[n:]


def check(cond, msg):
    print(("  ok  " if cond else "  FAIL") + " " + msg)
    if not cond:
        sys.exit(1)


with SessionLocal() as db:
    pid = seed(db)

    r, m = run(db, D1 - timedelta(days=7))
    check(r == [("tenant_due", "d-7", "L-2026-001")], f"7 days before: early alert {r}")
    check(m[0].to == "sara@muktasabat.com" and m[0].cc == ["ceo@example.com"], f"To employee, Cc CEO ({m[0].to} / {m[0].cc})")
    r, _ = run(db, D1 - timedelta(days=7))
    check(r == [], "same day again: nothing re-sent")
    r, m = run(db, D1 - timedelta(days=5))
    check(r == [("tenant_due", "d-7", "L-2026-002")], f"between stages: only the other lease's 7-day alert {r}")
    check(m[0].to == "ceo@example.com" and not m[0].cc and "No employee is responsible" in m[0].html_body,
          "unassigned property → CEO in To with a warning")
    r, m = run(db, D1 - timedelta(days=3))
    check(("tenant_due", "d-3", "L-2026-001") in r, "3 days before: early alert")
    r, m = run(db, D1)
    check(("tenant_due", "d0", "L-2026-001") in r, "due date: 'due today' alert")
    r, m = run(db, D1 + timedelta(days=1))
    check(("tenant_overdue", "d+1", "L-2026-001") in r, "day after: overdue alert")
    check(all("2026-09" not in x["due_date"] for x in pa.run_alerts(db, today=D1 + timedelta(days=1), dry_run=True)),
          "90-day-old unpaid instalment never alerts")

    # Tenant pays → received alert + owner payout due date
    from api.routers.payments import _create_payment_splits

    p = db.get(Payment, pid)
    p.status, p.paid_date = "paid", D1 + timedelta(days=2)
    p.owner_transfer_due_date = p.paid_date + timedelta(days=5)
    _create_payment_splits(db, p)
    db.commit()
    n = len(sent)
    pa.notify_payment_received(db, pid)
    check(len(sent) == n + 1 and "Rent payment received" in sent[-1].subject, "received alert on payment")
    check("9,500.00" in sent[-1].html_body, "owner net share (10,000 − 5% mgmt) shown")
    pa.notify_payment_received(db, pid)
    check(len(sent) == n + 1, "received alert not duplicated")

    r, m = run(db, p.owner_transfer_due_date - timedelta(days=3))
    check(("owner_due", "d-3", "L-2026-001") in r, "owner payout: early alert")
    r, m = run(db, p.owner_transfer_due_date)
    check(("owner_due", "d0", "L-2026-001") in r, "owner payout: due today")
    if html_out:
        open(html_out, "w").write(m[[i for i, x in enumerate(m) if "L-2026-001" in x.subject][0]].html_body)
    r, m = run(db, p.owner_transfer_due_date + timedelta(days=1))
    check(("owner_overdue", "d+1", "L-2026-001") in r, "owner payout: overdue")

    p.owner_transferred_date, p.owner_transfer_reference = p.owner_transfer_due_date + timedelta(days=1), "TRX-889"
    db.commit()
    pa.notify_owner_transferred(db, pid)
    check("Owner payout completed" in sent[-1].subject, "owner payout confirmation")
    r, _ = run(db, p.owner_transfer_due_date + timedelta(days=3))
    check(not [x for x in r if x[2] == "L-2026-001" and x[0].startswith("owner")], "no owner reminders after transfer")
    print(f"\nall good — {len(sent)} e-mails captured")

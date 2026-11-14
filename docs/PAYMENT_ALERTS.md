# Payment-timeline alerts (تنبيهات الدفعات)

Bilingual e-mails that follow every lease instalment through its two money movements.

**To:** the employee responsible for the property (`Building.assignee`; if none, the
employees linked to the owner; if none, the CEO with a "no responsible employee" warning).
**Cc:** `PAYMENT_ALERTS_CC` (the CEO).

| Alert | When |
|---|---|
| Tenant payment due (early) | 7, 3, 1 days before the due date (`PAYMENT_ALERT_LEAD_DAYS`) |
| Tenant payment due today | on the due date |
| Tenant payment overdue | +1, +3, +7, +14, +30 days while unpaid (`PAYMENT_ALERT_OVERDUE_DAYS`) |
| Payment received | immediately when staff mark it paid |
| Owner payout due (early / today) | same ladder, before the owner transfer date |
| Owner payout overdue | same ladder, after the owner transfer date |
| Owner payout completed | immediately when staff click **Transferred** on Payments |

Owner transfer date = tenant paid date + `OWNER_TRANSFER_DAYS` (default 5).
Every e-mail includes the instalment details (contract, Ejar no., property/unit, tenant,
owner, amount, deductions, net owner share, dates, responsible employee) and the whole
contract payment timeline.

## How it runs
- `api/services/payment_alerts.py`; an hourly loop started in `main.py` lifespan sends
  from `PAYMENT_ALERTS_HOUR` (default 8, Riyadh time). First run waits 90 s, so the deploy
  preflight container never sends.
- `payment_alert_logs` (unique payment + kind + stage) is claimed before sending → no
  duplicates. Only the latest due stage is sent, within `PAYMENT_ALERTS_CATCHUP_DAYS`
  (default 3) → old unpaid data never floods inboxes.
- Admin check: `POST /api/v1/payments/alerts/run?dry_run=true[&on=YYYY-MM-DD]`.
  History per payment: `GET /api/v1/payments/{id}/alerts`.
- Kill switch: `PAYMENT_ALERTS_ENABLED=false`.

## Production setup
Add to the server `.env`: `PAYMENT_ALERTS_CC=<ceo email>`. While SES is in sandbox, every
To/Cc address must be a verified SES identity.

Test: `DATABASE_URL=sqlite:////tmp/a.db SECRET_KEY=x python3 scripts/test_payment_alerts.py`

"""End-to-end test of admin data management (Excel export → edit → validate → import).

Run against a scratch database:
    DATABASE_URL=sqlite:////tmp/dio.db SECRET_KEY=test python3 scripts/test_data_io.py
"""
import io
import os
import sys
from datetime import date, datetime

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from api.main import app

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + ("" if condition else f" — {str(detail)[:600]}"))
    if not condition:
        FAILURES.append(label)


def sheet_cols(ws) -> dict[str, int]:
    return {c.value: c.column for c in ws[2] if c.value}


def put_row(ws, values: dict, row: int | None = None) -> int:
    cols = sheet_cols(ws)
    if row is None:
        row = 3
        while ws.cell(row=row, column=1).value not in (None, ""):
            row += 1
    for k, v in values.items():
        ws.cell(row=row, column=cols[k], value=v)
    return row


def find_row(ws, key: str, value) -> int:
    col = sheet_cols(ws)[key]
    for r in range(3, ws.max_row + 1):
        if ws.cell(row=r, column=col).value == value:
            return r
    raise LookupError(value)


def to_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def main() -> int:
    with TestClient(app) as c:
        tok = c.post("/api/v1/auth/login", data={"username": "admin", "password": "admin123"})
        h = {"Authorization": f"Bearer {tok.json()['access_token']}"}

        # Seed one owner → building → unit through the normal API.
        owner = c.post("/api/v1/owners", headers=h, json={
            "name": "مالك تجريبي", "owner_type": "individual", "id_type": "national_id",
            "national_id": "1012345678", "phone": "0501234567"}).json()
        building = c.post("/api/v1/buildings", headers=h, json={
            "owner_id": owner["id"], "name": "عمارة الاختبار", "building_code": "B-T1"}).json()
        unit = c.post("/api/v1/units", headers=h, json={
            "building_id": building["id"], "name": "شقة 1", "number": "1", "rent_amount": 2000}).json()
        check("seed data created", "id" in unit, unit)

        # ── Export ──────────────────────────────────────────────────────────
        print("export")
        r = c.get("/api/v1/data-io/export", headers=h)
        check("export returns xlsx", r.status_code == 200 and r.content[:2] == b"PK", r.status_code)
        wb = load_workbook(io.BytesIO(r.content))
        for name in ("README", "Owners", "Properties", "Units", "Tenants", "Lease contracts",
                     "Management contracts", "Lookups", "Dictionary"):
            check(f"sheet {name} present", name in wb.sheetnames, wb.sheetnames)
        check("owner exported", find_row(wb["Owners"], "id", owner["id"]) >= 3)
        check("lookup drop-down on owner_type",
              any("Lookups" in (dv.formula1 or "") for dv in wb["Owners"].data_validations.dataValidation))
        t = c.get("/api/v1/data-io/export?template=true", headers=h)
        tw = load_workbook(io.BytesIO(t.content))
        check("template has no data rows", tw["Owners"].cell(row=3, column=1).value is None)

        # ── Unchanged round-trip validates clean ───────────────────────────
        print("round-trip")
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", r.content)}).json()
        check("untouched export validates with 0 errors", v["ok"], v["errors"][:3])
        owners_summary = next(s for s in v["summary"] if s["sheet"] == "owners")
        check("untouched rows reported unchanged", owners_summary["update"] == 0 and owners_summary["unchanged"] >= 1, owners_summary)

        # ── Errors are caught, nothing is written ──────────────────────────
        print("strict validation")
        bad = load_workbook(io.BytesIO(r.content))
        ws = bad["Owners"]
        orow = find_row(ws, "id", owner["id"])
        put_row(ws, {"phone": 501234567, "owner_type": "Individual", "iban": "SA12 3456"}, orow)
        put_row(bad["Units"], {"id": None, "building_id": 999999, "name": "x", "number": "2",
                               "rent_amount": -5, "is_furnished": "maybe"})
        put_row(bad["Properties"], {"id": None, "owner_id": "NEW-404", "name": "bad link", "deed_date": "1445-02-01"})
        put_row(bad["Lease contracts"], {"id": None, "contract_number": "C-BAD", "contract_type": "residential",
                                         "unit_id": unit["id"], "start_date": date(2026, 1, 1),
                                         "end_date": date(2025, 1, 1), "rent_amount": 1000, "payment_cycle": 2})
        payload = to_bytes(bad)
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", payload)}).json()
        errs = {(e["sheet"], e["column"]) for e in v["errors"]}
        expected = {
            ("owners", "phone"), ("owners", "owner_type"), ("owners", "iban"),
            ("units", "building_id"), ("units", "rent_amount"), ("units", "is_furnished"),
            ("buildings", "owner_id"), ("buildings", "deed_date"),
            ("contracts", "end_date"), ("contracts", "payment_cycle"), ("contracts", "tenant_id"),
        }
        check("every planted error reported", expected <= errs, sorted(expected - errs))
        check("errors carry Arabic messages", all(e["message_ar"] for e in v["errors"]))
        a = c.post("/api/v1/data-io/apply", headers=h, files={"file": ("x.xlsx", payload)})
        check("apply refuses a file with errors (422)", a.status_code == 422, a.status_code)
        check("nothing written after refusal",
              c.get(f"/api/v1/owners/{owner['id']}", headers=h).json()["phone"] == "0501234567")

        # Structural problems
        broken = load_workbook(io.BytesIO(r.content))
        broken["Owners"].cell(row=2, column=sheet_cols(broken["Owners"])["phone"], value="mobile")
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", to_bytes(broken))}).json()
        check("renamed column key rejected", any(e["column"] in ("mobile", "phone") and e["row"] == 2 for e in v["errors"]), v["errors"][:3])
        foreign = io.BytesIO()
        from openpyxl import Workbook
        Workbook().save(foreign)
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", foreign.getvalue())})
        check("foreign workbook rejected", v.status_code == 422 and not v.json()["ok"], v.text[:200])
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", b"not a zip")})
        check("corrupt file rejected", v.status_code == 422, v.status_code)

        # ── Valid edit: update + new linked rows via NEW- keys ─────────────
        print("apply")
        good = load_workbook(io.BytesIO(r.content))
        put_row(good["Owners"], {"phone": "0559998888", "email": "owner@example.com"},
                find_row(good["Owners"], "id", owner["id"]))
        put_row(good["Owners"], {"id": "NEW-1", "owner_type": "company", "name": "شركة جديدة",
                                 "id_type": "cr", "national_id": "1010123456", "cr_number": "1010123456",
                                 "representative_name": "ممثل", "phone": "0112345678"})
        put_row(good["Properties"], {"id": "NEW-B1", "owner_id": "NEW-1", "name": "برج جديد",
                                     "property_type": "apartment_building", "national_address": "RRRD2929",
                                     "deed_date": date(2024, 5, 1)})
        put_row(good["Units"], {"id": "NEW-U1", "building_id": "NEW-B1", "name": "شقة 10", "number": "10",
                                "unit_type": "apartment", "rent_amount": 3000, "is_furnished": True})
        put_row(good["Tenants"], {"id": "NEW-T1", "tenant_type": "individual", "name": "مستأجر",
                                  "phone": "0533334444", "id_type": "iqama", "national_id": "2123456789"})
        put_row(good["Management contracts"], {"id": "NEW-M1", "contract_number": "MC-NEW-1", "owner_id": "NEW-1",
                                               "start_date": date(2026, 1, 1), "end_date": date(2027, 1, 1),
                                               "fee_type": "percentage", "fee_percentage": 5,
                                               "fee_collection_method": "deduct_from_rent", "status": "active"})
        put_row(good["Managed properties"], {"id": None, "management_contract_id": "NEW-M1", "building_id": "NEW-B1"})
        put_row(good["Lease contracts"], {"id": None, "contract_number": "C-NEW-1", "contract_type": "residential",
                                          "unit_id": "NEW-U1", "tenant_id": "NEW-T1", "management_contract_id": "NEW-M1",
                                          "start_date": date(2026, 1, 1), "end_date": date(2027, 1, 1),
                                          "total_rent_amount": 36000, "rent_amount": 3000, "payment_cycle": 1,
                                          "payment_count": 12, "insurance_amount": 1000})
        payload = to_bytes(good)
        v = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", payload)}).json()
        check("edited workbook validates", v["ok"], v["errors"][:5])
        a = c.post("/api/v1/data-io/apply", headers=h, files={"file": ("x.xlsx", payload)})
        check("apply succeeds", a.status_code == 200 and a.json()["applied"], a.text[:500])
        check("existing owner updated",
              c.get(f"/api/v1/owners/{owner['id']}", headers=h).json()["phone"] == "0559998888")
        contracts = c.get("/api/v1/contracts", headers=h).json()
        new_c = next((x for x in contracts if x["contract_number"] == "C-NEW-1"), None)
        check("new lease created", new_c is not None)
        units = c.get("/api/v1/units", headers=h).json()
        new_u = next(u for u in units if u["number"] == "10")
        check("NEW- keys resolved into real links", new_c and new_c["unit_id"] == new_u["id"], new_c)
        check("contract totals recalculated", new_c and abs(new_c["total_amount"] - 37000 * 1.15) < 0.01, new_c and new_c["total_amount"])
        mcs = c.get("/api/v1/management/contracts", headers=h).json()
        mc = next(x for x in mcs if x["contract_number"] == "MC-NEW-1")
        check("management fee recalculated", abs(mc["estimated_annual_fee"] - 3000 * 12 * 0.05) < 0.01, mc["estimated_annual_fee"])

        # Re-applying the same file must not duplicate (NEW- rows now collide on unique keys).
        a2 = c.post("/api/v1/data-io/validate", headers=h, files={"file": ("x.xlsx", payload)}).json()
        check("re-uploading NEW rows is blocked by uniqueness", not a2["ok"] and any("Duplicate" in e["message_en"] for e in a2["errors"]), a2["errors"][:3])

        # Unauthenticated requests are refused.
        check("export requires auth", c.get("/api/v1/data-io/export").status_code == 401)
    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED: {FAILURES}")
        return 1
    print("ALL PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())

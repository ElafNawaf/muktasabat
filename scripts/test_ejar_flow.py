"""End-to-end smoke test of the Ejar contract flows against a scratch database.

Exercises the sequence a real user follows:
  establishment profile → owner → property → management contract → Ejar
  registration → lease under that mandate → Ejar registration.

Run with:  DATABASE_URL=sqlite:////tmp/x.db python3 scripts/test_ejar_flow.py
"""

import sys

from fastapi.testclient import TestClient

from api.main import app

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: object = "") -> None:
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label} — {detail}")
        FAILURES.append(label)


def main() -> int:
    with TestClient(app) as c:
        tok = c.post(
            "/api/v1/auth/login", data={"username": "admin", "password": "admin123"}
        )
        check("admin login", tok.status_code == 200, tok.text[:300])
        if tok.status_code != 200:
            return 1
        h = {"Authorization": f"Bearer {tok.json()['access_token']}"}

        # ── 1. Establishment profile is required before anything is filed ────
        v = c.get("/api/v1/management/company/ejar/validate", headers=h).json()
        check("no establishment blocks Ejar", v["ready"] is False, v)

        company = c.put(
            "/api/v1/management/company",
            headers=h,
            json={
                "name": "شركة مكتسبات العقارية",
                "cr_number": "1010999888",
                "vat_number": "300000000000003",
                "fal_management_license_number": "1200012345",
                "fal_management_license_expiry": "2030-01-01",
                "representative_name": "إيلاف نواف",
                "representative_national_id": "1098765432",
                "phone": "0112345678",
                "city": "الرياض",
                "national_address": "RRRD2929",
            },
        )
        check("create establishment", company.status_code == 200, company.text[:300])
        v = c.get("/api/v1/management/company/ejar/validate", headers=h).json()
        check("establishment now valid", v["ready"] is True, v["issues"])

        # ── 2. Owner with incomplete Ejar identity ───────────────────────────
        owner = c.post(
            "/api/v1/owners",
            headers=h,
            json={
                "owner_type": "individual",
                "name": "عبدالله المالك",
                "national_id": "1010101010",
                "phone": "0500000010",
            },
        )
        check("create owner", owner.status_code == 201, owner.text[:300])
        owner_id = owner.json()["id"]

        building = c.post(
            "/api/v1/buildings",
            headers=h,
            json={
                "owner_id": owner_id,
                "name": "عمارة النخيل",
                "city": "الرياض",
                "district": "النخيل",
                "deed_number": "DEED-9001",
                "property_type": "residential",
                "national_address": "RRRD2929",
            },
        )
        check("create building", building.status_code == 201, building.text[:300])
        building_id = building.json()["id"]

        unit = c.post(
            "/api/v1/units",
            headers=h,
            json={
                "building_id": building_id,
                "name": "شقة 101",
                "number": "101",
                "rent_amount": 4000,
                "usage_type": "residential",
                "rooms_count": 3,
                "bathrooms_count": 2,
            },
        )
        check("create unit with Ejar fields", unit.status_code == 201, unit.text[:300])
        check(
            "unit usage persisted",
            unit.json().get("usage_type") == "residential",
            unit.json(),
        )
        unit_id = unit.json()["id"]

        # ── 3. Management contract (عقد إدارة أملاك) ─────────────────────────
        mc = c.post(
            "/api/v1/management/contracts",
            headers=h,
            json={
                "owner_id": owner_id,
                "contract_number": "MGT-0001",
                "start_date": "2026-01-01",
                "end_date": "2028-01-01",
                "duration_months": 24,
                "fee_type": "percentage",
                "fee_percentage": 5,
                "can_sign_leases": True,
                "properties": [{"building_id": building_id}],
            },
        )
        check("create management contract", mc.status_code == 201, mc.text[:400])
        mc_body = mc.json()
        mc_id = mc_body["id"]
        # 4000/month × 12 = 48000 annual rent → 5% = 2400, +15% VAT = 2760
        check(
            "management fee computed from rent roll",
            mc_body["estimated_annual_fee"] == 2400
            and mc_body["total_fee_amount"] == 2760,
            mc_body,
        )

        v = c.get(f"/api/v1/management/contracts/{mc_id}/ejar/validate", headers=h).json()
        check(
            "owner missing DOB/IBAN blocks Ejar",
            v["ready"] is False and v["error_count"] > 0,
            v["issues"],
        )
        fields = {i["field"] for i in v["issues"]}
        check("date_of_birth flagged", "date_of_birth" in fields, fields)
        check("iban flagged", "iban" in fields, fields)

        reg = c.post(f"/api/v1/management/contracts/{mc_id}/ejar/register", headers=h)
        check("register blocked while invalid", reg.status_code == 422, reg.status_code)

        # Fix the owner record the way the UI would.
        fixed = c.put(
            f"/api/v1/owners/{owner_id}",
            headers=h,
            json={
                "owner_type": "individual",
                "name": "عبدالله المالك",
                "national_id": "1010101010",
                "phone": "0500000010",
                "absher_phone": "0500000010",
                "date_of_birth": "1980-05-01",
                "id_type": "national_id",
                "nationality": "SA",
                "iban": "SA0380000000608010167519",
            },
        )
        check("update owner Ejar identity", fixed.status_code == 200, fixed.text[:300])
        check("id_type persisted", fixed.json()["id_type"] == "national_id", fixed.json())

        v = c.get(f"/api/v1/management/contracts/{mc_id}/ejar/validate", headers=h).json()
        check("management contract now ready", v["ready"] is True, v["issues"])

        reg = c.post(f"/api/v1/management/contracts/{mc_id}/ejar/register", headers=h)
        check("register management contract", reg.status_code == 200, reg.text[:400])
        mc_body = reg.json()
        check("ejar status registered", mc_body["ejar_status"] == "registered", mc_body)
        check(
            "ejar number + reference stored",
            bool(mc_body["ejar_contract_number"]) and bool(mc_body["ejar_reference"]),
            mc_body,
        )

        dup = c.post(f"/api/v1/management/contracts/{mc_id}/ejar/register", headers=h)
        check("double registration rejected", dup.status_code == 409, dup.status_code)

        # ── 4. Lease under that mandate ──────────────────────────────────────
        tenant = c.post(
            "/api/v1/tenants",
            headers=h,
            json={
                "tenant_type": "individual",
                "name": "سعد المستأجر",
                "phone": "0500000001",
                "national_id": "2020202020",
                "id_type": "iqama",
            },
        )
        check("create tenant", tenant.status_code == 201, tenant.text[:300])
        tenant_id = tenant.json()["id"]

        lease = c.post(
            "/api/v1/contracts",
            headers=h,
            json={
                "unit_id": unit_id,
                "tenant_id": tenant_id,
                "contract_number": "CT-0001",
                "contract_type": "residential",
                "start_date": "2026-02-01",
                "end_date": "2027-02-01",
                "rent_amount": 4000,
                "total_rent_amount": 48000,
                "payment_cycle": 3,
                "payment_count": 4,
                "management_contract_id": mc_id,
                "ejar_signed_by": "property_manager",
            },
        )
        check("create lease under mandate", lease.status_code == 201, lease.text[:400])
        lease_body = lease.json()
        lease_id = lease_body["id"]
        check(
            "management link stored",
            lease_body["management_contract_id"] == mc_id,
            lease_body,
        )

        v = c.get(f"/api/v1/contracts/{lease_id}/ejar/validate", headers=h).json()
        check(
            "iqama tenant missing expiry blocks Ejar",
            v["ready"] is False,
            v["issues"],
        )
        fields = {i["field"] for i in v["issues"]}
        check("id_expiry_date flagged for iqama", "id_expiry_date" in fields, fields)

        c.put(
            f"/api/v1/tenants/{tenant_id}",
            headers=h,
            json={
                "tenant_type": "individual",
                "name": "سعد المستأجر",
                "phone": "0500000001",
                "national_id": "2020202020",
                "id_type": "iqama",
                "id_expiry_date": "2029-06-01",
                "nationality": "EG",
                "date_of_birth": "1990-03-15",
            },
        )
        v = c.get(f"/api/v1/contracts/{lease_id}/ejar/validate", headers=h).json()
        check("lease now ready", v["ready"] is True, v["issues"])

        reg = c.post(f"/api/v1/contracts/{lease_id}/ejar/register", headers=h)
        check("register lease", reg.status_code == 200, reg.text[:400])
        check("lease registered", reg.json()["ejar_status"] == "registered", reg.json())

        # ── 5. A lease with no mandate must be blocked ───────────────────────
        owner2 = c.post(
            "/api/v1/owners",
            headers=h,
            json={"owner_type": "individual", "name": "فهد العقاري", "national_id": "4040404040"},
        ).json()
        b2 = c.post(
            "/api/v1/buildings",
            headers=h,
            json={
                "owner_id": owner2["id"],
                "name": "برج الياسمين",
                "city": "جدة",
                "district": "الياسمين",
                "deed_number": "DEED-9002",
            },
        ).json()
        u2 = c.post(
            "/api/v1/units",
            headers=h,
            json={"building_id": b2["id"], "name": "شقة 205", "number": "205", "rent_amount": 3000},
        ).json()
        l2 = c.post(
            "/api/v1/contracts",
            headers=h,
            json={
                "unit_id": u2["id"],
                "tenant_id": tenant_id,
                "contract_number": "CT-0002",
                "contract_type": "residential",
                "start_date": "2026-03-01",
                "end_date": "2027-03-01",
                "rent_amount": 3000,
                "total_rent_amount": 36000,
                "payment_cycle": 12,
            },
        )
        check("create unmandated lease", l2.status_code == 201, l2.text[:300])
        v = c.get(f"/api/v1/contracts/{l2.json()['id']}/ejar/validate", headers=h).json()
        fields = {i["field"] for i in v["issues"]}
        check(
            "missing mandate blocks lease registration",
            v["ready"] is False and "management_contract_id" in fields,
            v["issues"],
        )

        # ── 6. Cross-owner mandate must be rejected ──────────────────────────
        # A fresh unit under owner2, so the mandate check is what fails and not
        # the "unit already occupied" guard.
        u3 = c.post(
            "/api/v1/units",
            headers=h,
            json={"building_id": b2["id"], "name": "شقة 206", "number": "206", "rent_amount": 3000},
        ).json()
        bad = c.post(
            "/api/v1/contracts",
            headers=h,
            json={
                "unit_id": u3["id"],
                "tenant_id": tenant_id,
                "contract_number": "CT-0003",
                "contract_type": "residential",
                "start_date": "2026-04-01",
                "end_date": "2027-04-01",
                "rent_amount": 3000,
                "total_rent_amount": 36000,
                "payment_cycle": 12,
                "management_contract_id": mc_id,
            },
        )
        check("mandate from another owner rejected", bad.status_code == 422, bad.status_code)

        # ── 7. Deleting a mandate with leases under it is refused ────────────
        d = c.delete(f"/api/v1/management/contracts/{mc_id}", headers=h)
        check("delete blocked by dependent leases", d.status_code == 409, d.status_code)

        # ── 8. Cancelling on Ejar while leases are live is refused ───────────
        can = c.post(f"/api/v1/management/contracts/{mc_id}/ejar/cancel", headers=h)
        check("cancel blocked by live leases", can.status_code == 409, can.status_code)

        # ── 9. Sync from Ejar (stub) is idempotent ───────────────────────────
        s1 = c.post("/api/v1/management/ejar/sync", headers=h)
        check("management sync", s1.status_code == 200, s1.text[:300])
        s2 = c.post("/api/v1/management/ejar/sync", headers=h)
        check(
            "management sync is idempotent",
            s2.json()["created"] == 0 and s2.json()["fetched"] == s1.json()["fetched"],
            s2.json(),
        )

        lst = c.get("/api/v1/management/contracts", headers=h)
        check("list management contracts", lst.status_code == 200, lst.status_code)
        print(f"\n  {len(lst.json())} management contract(s) in the portal")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURE(S): " + ", ".join(FAILURES))
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

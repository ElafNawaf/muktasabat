"""
Import owners, tenants, buildings, units from the user's Excel files.

Idempotent — re-running it will UPDATE existing rows (matched by stable keys)
rather than create duplicates.

Match keys:
  owners    → name (trimmed)
  tenants   → name + phone (trimmed; phone defaults to "—" if missing)
  buildings → owner_id + name (trimmed)
  units     → building_id + number (trimmed)

The Excel files have:
  row 0 → English column machine names (template)
  row 1 → Arabic display labels (human-readable)
  row 2+ → actual data

We trust the position-based mapping below — NOT the English header names —
because the English template doesn't match what the user actually put in
some columns (e.g. col 9 in `owners` is `agent_name`, not `notes`).

Usage:
    python scripts/import_excel.py --db postgresql://... \\
        --owners owners.xlsx --tenants tenants.xlsx \\
        --buildings buildings.xlsx --units units.xlsx \\
        [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
import psycopg2
import psycopg2.extras

UNASSIGNED_OWNER_NAME = "غير محدد"  # "Unspecified" — fallback owner for buildings


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────


def clean(v):
    """Trim, coerce empty to None, stringify numbers preserving non-int values."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip() or None


def to_float(v, default=0.0):
    if v is None or v == "":
        return default
    try:
        if isinstance(v, str):
            v = v.strip().rstrip("%").replace(",", "")
            if not v:
                return default
        return float(v)
    except (ValueError, TypeError):
        return default


def to_int(v, default=0):
    if v is None or v == "":
        return default
    try:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return default
        return int(float(v))
    except (ValueError, TypeError):
        return default


def to_bool(v, default=True):
    """Yes/Available-ish strings → True. is_available in the source is fuzzy."""
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if not s:
        return default
    if s in {"نعم", "متاحة", "متاح", "yes", "y", "true", "1", "available"}:
        return True
    if s in {"لا", "غير متاحة", "no", "n", "false", "0", "unavailable", "الغاء"}:
        return False
    return default


def to_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def read_sheet(path: Path, skip_rows: int = 2):
    """Yield position-indexed tuples skipping the 2 header rows."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < skip_rows:
            continue
        # Skip totally-empty rows (Excel padding)
        if all(c is None or (isinstance(c, str) and not c.strip()) for c in row):
            continue
        yield row


def fetchone(cur, sql, params):
    cur.execute(sql, params)
    r = cur.fetchone()
    return r[0] if r else None


# ──────────────────────────────────────────────────────────────────────────
# Importers
# ──────────────────────────────────────────────────────────────────────────


def import_owners(conn, path: Path, dry_run: bool):  # dry_run kept for API symmetry but unused now
    """
    Owner columns (positional, from Arabic header — the English header
    in row 0 is wrong for cols 9-10):
      0  ref_code        (مرجعي — ignored; not in schema)
      1  name            (الاسم)
      2  name_en
      3  name_ar
      4  phone
      5  email
      6  national_id
      7  bank_name
      8  iban
      9  agent_name      → concatenated into notes
      10 agent_iban      → concatenated into notes
      11 notes_en
      12 notes_ar
    """
    inserted = updated = 0
    with conn.cursor() as cur:
        # Ensure fallback owner exists FIRST (used by buildings step)
        cur.execute(
            """
            INSERT INTO owners (name, name_ar, owner_type, notes, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (UNASSIGNED_OWNER_NAME, UNASSIGNED_OWNER_NAME, "individual",
             "Fallback owner for buildings imported without an explicit owner_ref. Re-assign in the UI.",
             datetime.utcnow()),
        )

        for row in read_sheet(path):
            row = list(row) + [None] * max(0, 13 - len(row))
            name = clean(row[1])
            if not name:
                continue

            name_en   = clean(row[2])
            name_ar   = clean(row[3]) or name
            phone     = clean(row[4])
            email     = clean(row[5])
            nat_id    = clean(row[6])
            bank      = clean(row[7])
            iban      = clean(row[8])
            agent_name = clean(row[9])
            agent_iban = clean(row[10])
            notes_en   = clean(row[11])
            notes_ar   = clean(row[12])

            # Pack agent info into notes
            extra_notes_parts = []
            if agent_name:
                extra_notes_parts.append(f"الوكيل: {agent_name}")
            if agent_iban:
                extra_notes_parts.append(f"ايبان الوكيل: {agent_iban}")
            notes = " | ".join(extra_notes_parts) if extra_notes_parts else None

            existing_id = fetchone(
                cur,
                "SELECT id FROM owners WHERE name = %s LIMIT 1",
                (name,),
            )
            if existing_id:
                cur.execute(
                    """
                    UPDATE owners
                    SET name_en = COALESCE(%s, name_en),
                        name_ar = COALESCE(%s, name_ar),
                        phone   = COALESCE(%s, phone),
                        email   = COALESCE(%s, email),
                        national_id = COALESCE(%s, national_id),
                        bank_name   = COALESCE(%s, bank_name),
                        iban        = COALESCE(%s, iban),
                        notes       = COALESCE(%s, notes),
                        notes_en    = COALESCE(%s, notes_en),
                        notes_ar    = COALESCE(%s, notes_ar)
                    WHERE id = %s
                    """,
                    (name_en, name_ar, phone, email, nat_id, bank, iban,
                     notes, notes_en, notes_ar, existing_id),
                )
                updated += 1
            else:
                cur.execute(
                    """
                    INSERT INTO owners
                      (name, name_en, name_ar, phone, email, national_id,
                       bank_name, iban, owner_type, notes, notes_en, notes_ar, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (name, name_en, name_ar, phone, email, nat_id, bank, iban,
                     "individual", notes, notes_en, notes_ar, datetime.utcnow()),
                )
                inserted += 1

    return inserted, updated


def import_tenants(conn, path: Path, dry_run: bool):
    """
    Tenant columns (positional, from Arabic header):
      0  ref_code        (ignored; not in schema)
      1  name
      2  name_en
      3  name_ar
      4  phone
      5  commercial_record  → cr_number (company)
      6  national_id
      7  birth_or_record_date → date_of_birth (individual) or company record date
      8  manager_national_id  → representative_national_id
      9  manager_name         → into notes
      10 manager_birth_date   → representative_date_of_birth
      11 email
      12 notes
      13 tax_number      → into notes
      14 notes_ar

    tenant_type is "company" when commercial_record (col 5) is present, else "individual".
    """
    inserted = updated = 0
    with conn.cursor() as cur:
        for row in read_sheet(path):
            row = list(row) + [None] * max(0, 15 - len(row))
            name = clean(row[1])
            if not name:
                continue

            name_en  = clean(row[2])
            name_ar  = clean(row[3]) or name
            phone    = clean(row[4]) or "—"   # NOT NULL fallback
            comm_reg = clean(row[5])
            nat_id   = clean(row[6]) or "—"   # NOT NULL fallback
            birth    = to_date(row[7])
            mgr_id   = clean(row[8])
            mgr_name = clean(row[9])
            mgr_birth = to_date(row[10])
            email    = clean(row[11])
            notes_in = clean(row[12])
            tax_no   = clean(row[13])
            notes_ar = clean(row[14])

            tenant_type = "company" if comm_reg else "individual"
            cr_number = comm_reg if tenant_type == "company" else None
            absher_phone = phone if tenant_type == "company" and phone != "—" else None
            date_of_birth = birth if tenant_type == "individual" else None
            rep_nat_id = mgr_id if tenant_type == "company" else None
            rep_dob = mgr_birth if tenant_type == "company" else None
            if tenant_type == "company":
                nat_id = rep_nat_id or cr_number or nat_id

            notes_parts = []
            if notes_in:
                notes_parts.append(notes_in)
            if mgr_name:
                notes_parts.append(f"المدير: {mgr_name}")
            if tax_no:
                notes_parts.append(f"الرقم الضريبي: {tax_no}")
            notes = " | ".join(notes_parts) if notes_parts else None

            existing_id = fetchone(
                cur,
                "SELECT id FROM tenants WHERE name = %s AND phone = %s LIMIT 1",
                (name, phone),
            )
            if existing_id:
                cur.execute(
                    """
                    UPDATE tenants
                    SET tenant_type = %s,
                        name_en = COALESCE(%s, name_en),
                        name_ar = COALESCE(%s, name_ar),
                        national_id = CASE WHEN %s <> '—' THEN %s ELSE national_id END,
                        date_of_birth = COALESCE(%s, date_of_birth),
                        cr_number = COALESCE(%s, cr_number),
                        absher_phone = COALESCE(%s, absher_phone),
                        representative_national_id = COALESCE(%s, representative_national_id),
                        representative_date_of_birth = COALESCE(%s, representative_date_of_birth),
                        email   = COALESCE(%s, email),
                        notes   = COALESCE(%s, notes),
                        notes_ar = COALESCE(%s, notes_ar)
                    WHERE id = %s
                    """,
                    (tenant_type, name_en, name_ar, nat_id, nat_id,
                     date_of_birth, cr_number, absher_phone, rep_nat_id, rep_dob,
                     email, notes, notes_ar, existing_id),
                )
                updated += 1
            else:
                cur.execute(
                    """
                    INSERT INTO tenants
                      (tenant_type, name, name_en, name_ar, phone, national_id,
                       date_of_birth, cr_number, absher_phone,
                       representative_national_id, representative_date_of_birth,
                       email, notes, notes_ar, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (tenant_type, name, name_en, name_ar, phone, nat_id,
                     date_of_birth, cr_number, absher_phone, rep_nat_id, rep_dob,
                     email, notes, notes_ar, datetime.utcnow()),
                )
                inserted += 1

    return inserted, updated


def import_buildings(conn, path: Path, dry_run: bool):
    """
    Building columns (positional, from Arabic header — IMPORTANT: col 0 is
    something like 'كود المبنى' not a real building code — actual building_code
    is at col 17). The English header in col 10 is 'None' but the Arabic header
    says 'رقم عداد المياة' (water meter); however col 18 says the same thing
    so col 10 looks duplicated/template data. We map by position to the Arabic
    spec:

      0  ref_code (unused)
      1  owner_ref (lookup key — but empty in current data → fallback owner)
      2  assignee_username
      3  name
      4  name_en
      5  name_ar
      6  address
      7  address_en
      8  address_ar
      9  city
      10 (skipped — duplicate/template)
      11 city_en
      12 city_ar
      13 district
      14 district_en
      15 district_ar
      16 contract_type
      17 building_code
      18 water_meter_number
      19 electricity_meter_number
      20 lease_contract_number
      21 branch
      22 street
      23 latitude
      24 longitude
      25 deed_number
      26 deed_document_type
      27 deed_date
      28 deed_document_number
      29 property_type
      30 residence_type
      31 apartments_count
      32 offices_count
      33 commercial_shops_count
      34 notes
      35 notes_en
      36 notes_ar
      37 management_percentage
      38 agent_percentage
      39 tax_percentage (no schema column → into notes)
    """
    inserted = updated = 0
    skipped = []
    with conn.cursor() as cur:
        # Load all owners → for substring-match heuristic
        cur.execute("SELECT id, name FROM owners")
        owners = cur.fetchall()  # [(id, name), ...]
        fallback_owner_id = fetchone(
            cur, "SELECT id FROM owners WHERE name = %s", (UNASSIGNED_OWNER_NAME,)
        )
        if not fallback_owner_id:
            raise RuntimeError("Fallback owner missing — owners import did not run?")

        for row in read_sheet(path):
            row = list(row) + [None] * max(0, 40 - len(row))
            name = clean(row[3])
            if not name:
                continue

            # Pick owner: substring match in building name, else fallback
            owner_id = fallback_owner_id
            for oid, oname in owners:
                if oname and oname != UNASSIGNED_OWNER_NAME and oname in name:
                    owner_id = oid
                    break

            name_en  = clean(row[4])
            name_ar  = clean(row[5]) or name
            address  = clean(row[6])
            address_en = clean(row[7])
            address_ar = clean(row[8])
            city     = clean(row[9])
            city_en  = clean(row[11])
            city_ar  = clean(row[12])
            district = clean(row[13])
            district_en = clean(row[14])
            district_ar = clean(row[15])
            contract_type = clean(row[16])
            building_code = clean(row[17])
            water_mtr     = clean(row[18])
            elec_mtr      = clean(row[19])
            lease_no      = clean(row[20])
            branch        = clean(row[21])
            street        = clean(row[22])
            lat = to_float(row[23], None) if row[23] not in (None, "") else None
            lon = to_float(row[24], None) if row[24] not in (None, "") else None
            deed_no       = clean(row[25])
            deed_doc_type = clean(row[26])
            deed_date     = None  # leave None — source format is unclear
            deed_doc_no   = clean(row[28])
            prop_type     = clean(row[29])
            res_type      = clean(row[30])
            apartments    = to_int(row[31])
            offices       = to_int(row[32])
            shops         = to_int(row[33])
            notes_in      = clean(row[34])
            notes_en      = clean(row[35])
            notes_ar      = clean(row[36])
            mgmt_pct      = to_float(row[37])  # source is 0.05 → keep as-is
            agent_pct     = to_float(row[38])
            tax_pct       = to_float(row[39]) if row[39] not in (None, "") else None

            notes_parts = []
            if notes_in:
                notes_parts.append(notes_in)
            if tax_pct is not None:
                notes_parts.append(f"نسبة الضريبة: {tax_pct}")
            if mgmt_pct:
                notes_parts.append(f"نسبة الإدارة: {mgmt_pct}")
            if agent_pct:
                notes_parts.append(f"نسبة الوكيل: {agent_pct}")
            notes = " | ".join(notes_parts) if notes_parts else None

            existing_id = fetchone(
                cur,
                "SELECT id FROM buildings WHERE owner_id = %s AND name = %s LIMIT 1",
                (owner_id, name),
            )
            if existing_id:
                cur.execute(
                    """
                    UPDATE buildings
                    SET name_en = COALESCE(%s, name_en),
                        name_ar = COALESCE(%s, name_ar),
                        address = COALESCE(%s, address),
                        address_en = COALESCE(%s, address_en),
                        address_ar = COALESCE(%s, address_ar),
                        city = COALESCE(%s, city),
                        city_en = COALESCE(%s, city_en),
                        city_ar = COALESCE(%s, city_ar),
                        district = COALESCE(%s, district),
                        district_en = COALESCE(%s, district_en),
                        district_ar = COALESCE(%s, district_ar),
                        contract_type = COALESCE(%s, contract_type),
                        building_code = COALESCE(%s, building_code),
                        water_meter_number = COALESCE(%s, water_meter_number),
                        electricity_meter_number = COALESCE(%s, electricity_meter_number),
                        lease_contract_number = COALESCE(%s, lease_contract_number),
                        branch = COALESCE(%s, branch),
                        street = COALESCE(%s, street),
                        latitude = COALESCE(%s, latitude),
                        longitude = COALESCE(%s, longitude),
                        deed_number = COALESCE(%s, deed_number),
                        deed_document_type = COALESCE(%s, deed_document_type),
                        deed_document_number = COALESCE(%s, deed_document_number),
                        property_type = COALESCE(%s, property_type),
                        residence_type = COALESCE(%s, residence_type),
                        apartments_count = GREATEST(apartments_count, %s),
                        offices_count    = GREATEST(offices_count, %s),
                        commercial_shops_count = GREATEST(commercial_shops_count, %s),
                        notes = COALESCE(%s, notes),
                        notes_en = COALESCE(%s, notes_en),
                        notes_ar = COALESCE(%s, notes_ar)
                    WHERE id = %s
                    """,
                    (name_en, name_ar, address, address_en, address_ar,
                     city, city_en, city_ar, district, district_en, district_ar,
                     contract_type, building_code, water_mtr, elec_mtr, lease_no,
                     branch, street, lat, lon, deed_no, deed_doc_type, deed_doc_no,
                     prop_type, res_type, apartments, offices, shops,
                     notes, notes_en, notes_ar, existing_id),
                )
                updated += 1
            else:
                cur.execute(
                    """
                    INSERT INTO buildings
                      (owner_id, name, name_en, name_ar,
                       address, address_en, address_ar,
                       city, city_en, city_ar,
                       district, district_en, district_ar,
                       contract_type, building_code,
                       water_meter_number, electricity_meter_number,
                       lease_contract_number, branch, street,
                       latitude, longitude,
                       deed_number, deed_document_type, deed_document_number,
                       property_type, residence_type,
                       apartments_count, offices_count, commercial_shops_count,
                       notes, notes_en, notes_ar, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (owner_id, name, name_en, name_ar,
                     address, address_en, address_ar,
                     city, city_en, city_ar,
                     district, district_en, district_ar,
                     contract_type, building_code,
                     water_mtr, elec_mtr, lease_no, branch, street,
                     lat, lon,
                     deed_no, deed_doc_type, deed_doc_no,
                     prop_type, res_type,
                     apartments, offices, shops,
                     notes, notes_en, notes_ar, datetime.utcnow()),
                )
                inserted += 1

    return inserted, updated, skipped


def import_units(conn, path: Path, dry_run: bool):
    """
    Unit columns (positional, from Arabic header):
      0  ref_code (unused)
      1  building_ref (= building NAME — used to look up building_id)
      2  number
      3  name
      4  name_en
      5  name_ar
      6  unit_type
      7  description (→ notes)
      8  area_sqm
      9  rent_amount
      10 management_percentage
      11 agent_name
      12 agent_percentage
      13 electric_invoice
      14 water_invoice
      15 ejar_fee
      16 is_available
      17 notes
      18 notes_en
      19 notes_ar
    """
    inserted = updated = 0
    auto_created_buildings = 0
    skipped = []
    with conn.cursor() as cur:
        # Load buildings for lookup: prefer EXACT name match, fall back to trimmed
        cur.execute("SELECT id, name FROM buildings")
        buildings_by_name = {}
        for bid, bname in cur.fetchall():
            if bname:
                buildings_by_name.setdefault(bname.strip(), bid)

        # Fallback owner for skeleton buildings
        fallback_owner_id = fetchone(
            cur, "SELECT id FROM owners WHERE name = %s", (UNASSIGNED_OWNER_NAME,)
        )

        for row in read_sheet(path):
            row = list(row) + [None] * max(0, 20 - len(row))
            building_ref = clean(row[1])
            number = clean(row[2]) or clean(row[3])  # fall back to name as number
            if not building_ref or not number:
                continue

            bid = buildings_by_name.get(building_ref.strip())
            if not bid:
                # Best-effort substring lookup
                for bname, _bid in buildings_by_name.items():
                    if building_ref in bname or bname in building_ref:
                        bid = _bid
                        break
            if not bid:
                # Auto-create skeleton building under the fallback owner
                cur.execute(
                    """
                    INSERT INTO buildings
                      (owner_id, name, name_ar,
                       apartments_count, offices_count, commercial_shops_count,
                       notes, created_at)
                    VALUES (%s, %s, %s, 0, 0, 0, %s, %s)
                    RETURNING id
                    """,
                    (fallback_owner_id, building_ref.strip(), building_ref.strip(),
                     "تم إنشاؤه تلقائيًا أثناء استيراد الوحدات — لا توجد بيانات مبنى تفصيلية.",
                     datetime.utcnow()),
                )
                bid = cur.fetchone()[0]
                buildings_by_name[building_ref.strip()] = bid
                auto_created_buildings += 1

            name = clean(row[3]) or f"Unit {number}"
            name_en = clean(row[4])
            name_ar = clean(row[5]) or name
            unit_type = clean(row[6])
            description = clean(row[7])
            area = to_float(row[8], None) if row[8] not in (None, "") else None
            rent = to_float(row[9])
            mgmt_pct = to_float(row[10])
            agent_name = clean(row[11])
            agent_pct = to_float(row[12])
            elec_inv = clean(row[13])
            water_inv = clean(row[14])
            ejar_fee = to_float(row[15])
            is_avail = to_bool(row[16], default=True)
            notes_in = clean(row[17])
            notes_en = clean(row[18])
            notes_ar = clean(row[19])

            notes_parts = []
            if description:
                notes_parts.append(description)
            if notes_in:
                notes_parts.append(notes_in)
            notes = " | ".join(notes_parts) if notes_parts else None

            existing_id = fetchone(
                cur,
                "SELECT id FROM units WHERE building_id = %s AND number = %s LIMIT 1",
                (bid, number),
            )
            if existing_id:
                cur.execute(
                    """
                    UPDATE units
                    SET name = COALESCE(%s, name),
                        name_en = COALESCE(%s, name_en),
                        name_ar = COALESCE(%s, name_ar),
                        unit_type = COALESCE(%s, unit_type),
                        area_sqm = COALESCE(%s, area_sqm),
                        rent_amount = CASE WHEN %s > 0 THEN %s ELSE rent_amount END,
                        management_percentage = CASE WHEN %s > 0 THEN %s ELSE management_percentage END,
                        agent_name = COALESCE(%s, agent_name),
                        agent_percentage = CASE WHEN %s > 0 THEN %s ELSE agent_percentage END,
                        electric_invoice = COALESCE(%s, electric_invoice),
                        water_invoice = COALESCE(%s, water_invoice),
                        ejar_fee = CASE WHEN %s > 0 THEN %s ELSE ejar_fee END,
                        is_available = %s,
                        notes = COALESCE(%s, notes),
                        notes_en = COALESCE(%s, notes_en),
                        notes_ar = COALESCE(%s, notes_ar)
                    WHERE id = %s
                    """,
                    (name, name_en, name_ar, unit_type, area,
                     rent, rent, mgmt_pct, mgmt_pct,
                     agent_name, agent_pct, agent_pct,
                     elec_inv, water_inv, ejar_fee, ejar_fee,
                     is_avail, notes, notes_en, notes_ar, existing_id),
                )
                updated += 1
            else:
                cur.execute(
                    """
                    INSERT INTO units
                      (building_id, name, name_en, name_ar, number,
                       unit_type, area_sqm, rent_amount,
                       management_percentage, agent_name, agent_percentage,
                       electric_invoice, water_invoice, ejar_fee, is_available,
                       notes, notes_en, notes_ar, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (bid, name, name_en, name_ar, number,
                     unit_type, area, rent,
                     mgmt_pct, agent_name, agent_pct,
                     elec_inv, water_inv, ejar_fee, is_avail,
                     notes, notes_en, notes_ar, datetime.utcnow()),
                )
                inserted += 1

    return inserted, updated, skipped, auto_created_buildings


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────


def main():
    ap = argparse.ArgumentParser(description="Import Muktasabat reference data from Excel")
    ap.add_argument("--db", required=True, help="postgresql:// URL")
    ap.add_argument("--owners", required=True, type=Path)
    ap.add_argument("--tenants", required=True, type=Path)
    ap.add_argument("--buildings", required=True, type=Path)
    ap.add_argument("--units", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true",
                    help="Roll back the transaction at the end of each step")
    args = ap.parse_args()

    for p in (args.owners, args.tenants, args.buildings, args.units):
        if not p.exists():
            print(f"❌ Missing: {p}", file=sys.stderr)
            sys.exit(2)

    conn = psycopg2.connect(args.db)
    conn.set_client_encoding("UTF8")
    psycopg2.extras.register_default_jsonb(conn)

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"╔══ Importing into {args.db.split('@')[1].split('/')[0]}  ({mode})")

    o_ins, o_upd = import_owners(conn, args.owners, args.dry_run)
    print(f"║ owners    → +{o_ins} inserted   ~{o_upd} updated")

    t_ins, t_upd = import_tenants(conn, args.tenants, args.dry_run)
    print(f"║ tenants   → +{t_ins} inserted   ~{t_upd} updated")

    b_ins, b_upd, _ = import_buildings(conn, args.buildings, args.dry_run)
    print(f"║ buildings → +{b_ins} inserted   ~{b_upd} updated")

    u_ins, u_upd, u_skip, b_auto = import_units(conn, args.units, args.dry_run)
    print(f"║ units     → +{u_ins} inserted   ~{u_upd} updated   (auto-created {b_auto} skeleton buildings)")
    if u_skip:
        print(f"║   ✗{len(u_skip)} units still skipped (couldn't match or create — first 5):")
        for ref, num in u_skip[:5]:
            print(f"║     - building='{ref}' unit='{num}'")

    if args.dry_run:
        conn.rollback()
        print(f"╚══ DRY RUN — all changes rolled back")
    else:
        conn.commit()
        print(f"╚══ committed")


if __name__ == "__main__":
    main()

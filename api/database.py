from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from api.config import get_settings

settings = get_settings()

# SQLite needs a special connect arg; PostgreSQL doesn't.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def ensure_user_password_reset_columns(engine) -> None:
    """Add reset columns when DB predates them (create_all does not ALTER)."""
    insp = inspect(engine)
    if not insp.has_table("users"):
        return
    existing = {c["name"] for c in insp.get_columns("users")}
    stmts: list[str] = []
    if "password_reset_token" not in existing:
        stmts.append("ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(128)")
    if "password_reset_expires" not in existing:
        if engine.dialect.name == "sqlite":
            stmts.append("ALTER TABLE users ADD COLUMN password_reset_expires DATETIME")
        else:
            stmts.append("ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def ensure_user_email_verification_columns(engine) -> None:
    """Add email_verified / email_verification_token / _expires when DB predates them."""
    insp = inspect(engine)
    if not insp.has_table("users"):
        return
    existing = {c["name"] for c in insp.get_columns("users")}
    stmts: list[str] = []
    if "email_verified" not in existing:
        if engine.dialect.name == "sqlite":
            stmts.append("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0 NOT NULL")
        else:
            stmts.append("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false NOT NULL")
    if "email_verification_token" not in existing:
        stmts.append("ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(128)")
    if "email_verification_expires" not in existing:
        if engine.dialect.name == "sqlite":
            stmts.append("ALTER TABLE users ADD COLUMN email_verification_expires DATETIME")
        else:
            stmts.append("ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def ensure_building_assignee_column(engine) -> None:
    """Add buildings.assignee_id when DB predates it."""
    insp = inspect(engine)
    if not insp.has_table("buildings"):
        return
    existing = {c["name"] for c in insp.get_columns("buildings")}
    if "assignee_id" in existing:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE buildings ADD COLUMN assignee_id INTEGER"))


def ensure_building_location_columns(engine) -> None:
    """Add buildings.latitude / buildings.longitude when DB predates them."""
    insp = inspect(engine)
    if not insp.has_table("buildings"):
        return
    existing = {c["name"] for c in insp.get_columns("buildings")}
    stmts: list[str] = []
    if "latitude" not in existing:
        stmts.append("ALTER TABLE buildings ADD COLUMN latitude FLOAT")
    if "longitude" not in existing:
        stmts.append("ALTER TABLE buildings ADD COLUMN longitude FLOAT")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def ensure_building_extended_columns(engine) -> None:
    """Add property/deed/utility columns when buildings table predates them."""
    insp = inspect(engine)
    if not insp.has_table("buildings"):
        return
    existing = {c["name"] for c in insp.get_columns("buildings")}
    stmts: list[str] = []
    additions: list[tuple[str, str]] = [
        ("contract_type", "VARCHAR(50)"),
        ("building_code", "VARCHAR(50)"),
        ("water_meter_number", "VARCHAR(50)"),
        ("electricity_meter_number", "VARCHAR(50)"),
        ("lease_contract_number", "VARCHAR(50)"),
        ("branch", "VARCHAR(100)"),
        ("street", "VARCHAR(200)"),
        ("deed_number", "VARCHAR(50)"),
        ("deed_document_type", "VARCHAR(50)"),
        ("deed_date", "DATE"),
        ("deed_document_number", "VARCHAR(50)"),
        ("property_type", "VARCHAR(50)"),
        ("residence_type", "VARCHAR(50)"),
        ("offices_count", "INTEGER DEFAULT 0 NOT NULL"),
        ("commercial_shops_count", "INTEGER DEFAULT 0 NOT NULL"),
        ("apartments_count", "INTEGER DEFAULT 0 NOT NULL"),
    ]
    for name, col_type in additions:
        if name not in existing:
            stmts.append(f"ALTER TABLE buildings ADD COLUMN {name} {col_type}")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def ensure_contract_extended_columns(engine) -> None:
    """Add billing/Ejar/duration columns when contracts table predates them."""
    insp = inspect(engine)
    if not insp.has_table("contracts"):
        return
    existing = {c["name"] for c in insp.get_columns("contracts")}
    is_sqlite = engine.dialect.name == "sqlite"
    bool_type = "BOOLEAN" if not is_sqlite else "BOOLEAN"
    json_type = "TEXT" if is_sqlite else "JSON"
    datetime_type = "DATETIME" if is_sqlite else "TIMESTAMP"
    stmts: list[str] = []
    additions: list[tuple[str, str]] = [
        ("branch", "VARCHAR(100)"),
        ("contract_type", "VARCHAR(20) DEFAULT 'residential' NOT NULL"),
        ("validity_type", "VARCHAR(30)"),
        ("duration_years", "INTEGER DEFAULT 1 NOT NULL"),
        ("duration_months", "INTEGER DEFAULT 0 NOT NULL"),
        ("duration_days", "INTEGER DEFAULT 0 NOT NULL"),
        ("total_rent_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("ejar_contract_number", "VARCHAR(50)"),
        ("payment_type", "VARCHAR(30)"),
        ("payment_count", "INTEGER DEFAULT 1 NOT NULL"),
        ("electricity_on_tenant", f"{bool_type} DEFAULT {'1' if is_sqlite else 'true'} NOT NULL"),
        ("electricity_split_percentage", "FLOAT"),
        ("water_on_tenant", f"{bool_type} DEFAULT {'1' if is_sqlite else 'true'} NOT NULL"),
        ("water_split_percentage", "FLOAT"),
        ("electricity_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("water_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("electricity_meter_number", "VARCHAR(50)"),
        ("water_meter_number", "VARCHAR(50)"),
        ("services_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("insurance_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("vat_rate", "FLOAT DEFAULT 15 NOT NULL"),
        ("vat_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("total_amount", "FLOAT DEFAULT 0 NOT NULL"),
        ("agent_percentage", "FLOAT DEFAULT 0 NOT NULL"),
        ("management_percentage", "FLOAT DEFAULT 0 NOT NULL"),
        ("agent_id", "INTEGER"),
        ("ejar_status", "VARCHAR(20)"),
        ("ejar_registered_at", datetime_type),
        ("ejar_response_data", json_type),
    ]
    for name, col_type in additions:
        if name not in existing:
            stmts.append(f"ALTER TABLE contracts ADD COLUMN {name} {col_type}")
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
        if "total_rent_amount" not in existing:
            conn.execute(
                text(
                    "UPDATE contracts SET total_rent_amount = rent_amount "
                    "WHERE total_rent_amount IS NULL OR total_rent_amount = 0"
                )
            )
        if "total_amount" not in existing:
            # Postgres ROUND only accepts numeric, not double precision;
            # rent/insurance/etc. are Float, so cast the sum before rounding.
            conn.execute(
                text(
                    "UPDATE contracts SET vat_rate = 15, "
                    "vat_amount = ROUND(CAST("
                    "(COALESCE(total_rent_amount, 0) + COALESCE(insurance_amount, 0) + "
                    "COALESCE(electricity_amount, 0) + COALESCE(water_amount, 0)) * 0.15 AS NUMERIC), 2), "
                    "total_amount = ROUND(CAST("
                    "(COALESCE(total_rent_amount, 0) + COALESCE(insurance_amount, 0) + "
                    "COALESCE(electricity_amount, 0) + COALESCE(water_amount, 0)) * 1.15 AS NUMERIC), 2)"
                )
            )


def ensure_contract_tenant_nullable(engine) -> None:
    """Allow NULL tenant_id for management (owner↔company) contracts."""
    insp = inspect(engine)
    if not insp.has_table("contracts"):
        return
    cols = {c["name"]: c for c in insp.get_columns("contracts")}
    tenant = cols.get("tenant_id")
    if tenant is None or tenant.get("nullable", False):
        return
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE contracts ALTER COLUMN tenant_id DROP NOT NULL"))
        return
    # SQLite cannot ALTER nullability in place. Leave existing DBs as-is;
    # new create_all schemas already use nullable tenant_id from the model.
    # Management contracts without a tenant require a fresh DB or Postgres.


def ensure_tenant_extended_columns(engine) -> None:
    """Add tenant type / company fields when the tenants table predates them."""
    insp = inspect(engine)
    if not insp.has_table("tenants"):
        return
    existing = {c["name"] for c in insp.get_columns("tenants")}
    additions: list[tuple[str, str]] = [
        ("tenant_type", "VARCHAR(20) DEFAULT 'individual' NOT NULL"),
        ("date_of_birth", "DATE"),
        ("cr_number", "VARCHAR(20)"),
        ("cr_date", "DATE"),
        ("absher_phone", "VARCHAR(20)"),
        ("representative_name", "VARCHAR(150)"),
        ("representative_national_id", "VARCHAR(20)"),
        ("representative_date_of_birth", "DATE"),
        ("tax_number", "VARCHAR(30)"),
    ]
    stmts = [
        f"ALTER TABLE tenants ADD COLUMN {name} {col_type}"
        for name, col_type in additions
        if name not in existing
    ]
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def migrate_tenant_escorts_to_companions(engine) -> None:
    """Copy legacy tenant_escorts rows into tenant_companions after the rename."""
    insp = inspect(engine)
    if not insp.has_table("tenant_escorts") or not insp.has_table("tenant_companions"):
        return
    with engine.begin() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM tenant_companions")).scalar()
        if count and count > 0:
            return
        conn.execute(
            text(
                """
                INSERT INTO tenant_companions (tenant_id, name, national_id, date_of_birth)
                SELECT tenant_id, name, national_id, date_of_birth FROM tenant_escorts
                """
            )
        )


def ensure_owner_agent_id_column(engine) -> None:
    """Add owner columns when the owners table predates them."""
    insp = inspect(engine)
    if not insp.has_table("owners"):
        return
    existing = {c["name"] for c in insp.get_columns("owners")}
    additions: list[tuple[str, str]] = [
        ("agent_id", "INTEGER"),
        ("owner_type", "VARCHAR(20) DEFAULT 'individual' NOT NULL"),
        ("date_of_birth", "DATE"),
        ("cr_number", "VARCHAR(20)"),
        ("representative_national_id", "VARCHAR(20)"),
        ("representative_date_of_birth", "DATE"),
        ("representative_phone", "VARCHAR(20)"),
    ]
    stmts = [
        f"ALTER TABLE owners ADD COLUMN {name} {col_type}"
        for name, col_type in additions
        if name not in existing
    ]
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def _add_missing_columns(engine, table: str, additions: list[tuple[str, str]]) -> None:
    """ALTER TABLE … ADD COLUMN for every column not already present.

    ``create_all`` only creates missing *tables*, so new columns on an existing
    table have to be added by hand. Both SQLite and PostgreSQL support the
    simple ``ADD COLUMN`` form used here.
    """
    insp = inspect(engine)
    if not insp.has_table(table):
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    stmts = [
        f"ALTER TABLE {table} ADD COLUMN {name} {col_type}"
        for name, col_type in additions
        if name not in existing
    ]
    if not stmts:
        return
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))


def ensure_ejar_party_columns(engine) -> None:
    """Add the Ejar party-identity columns to owners and tenants.

    Ejar identifies every contract party by ID type + number + nationality and
    verifies them through Absher, so those columns must exist on both sides
    before a contract can be submitted.
    """
    party_columns: list[tuple[str, str]] = [
        ("id_type", "VARCHAR(20) DEFAULT 'national_id' NOT NULL"),
        ("id_expiry_date", "DATE"),
        ("nationality", "VARCHAR(60)"),
        ("national_address", "VARCHAR(120)"),
        ("ejar_party_id", "VARCHAR(50)"),
    ]
    _add_missing_columns(
        engine,
        "owners",
        party_columns
        + [("absher_phone", "VARCHAR(20)"), ("representative_name", "VARCHAR(150)")],
    )
    # tenants already carry absher_phone / representative_name
    _add_missing_columns(engine, "tenants", party_columns)


def ensure_ejar_property_columns(engine) -> None:
    """Add the Ejar property / unit identifiers to buildings and units."""
    _add_missing_columns(
        engine,
        "buildings",
        [
            ("national_address", "VARCHAR(120)"),
            ("postal_code", "VARCHAR(10)"),
            ("additional_number", "VARCHAR(10)"),
            ("building_number", "VARCHAR(10)"),
            ("ejar_property_id", "VARCHAR(50)"),
        ],
    )
    false_literal = "0" if engine.dialect.name == "sqlite" else "false"
    _add_missing_columns(
        engine,
        "units",
        [
            ("ejar_unit_id", "VARCHAR(50)"),
            ("usage_type", "VARCHAR(30)"),
            ("rooms_count", "INTEGER"),
            ("bathrooms_count", "INTEGER"),
            ("is_furnished", f"BOOLEAN DEFAULT {false_literal} NOT NULL"),
        ],
    )


def ensure_contract_ejar_columns(engine) -> None:
    """Add the management-contract link and extended Ejar columns to contracts."""
    _add_missing_columns(
        engine,
        "contracts",
        [
            ("management_contract_id", "INTEGER"),
            ("ejar_reference", "VARCHAR(64)"),
            ("ejar_last_error", "TEXT"),
            ("ejar_registration_fee", "FLOAT DEFAULT 0 NOT NULL"),
            ("ejar_signed_by", "VARCHAR(20) DEFAULT 'property_manager' NOT NULL"),
        ],
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

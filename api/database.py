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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

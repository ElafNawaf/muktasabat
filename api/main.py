import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, update

from api.config import get_settings
from api.database import Base, SessionLocal, engine, ensure_user_password_reset_columns
from api.routers import (
    analytics,
    auth,
    buildings,
    contracts,
    employees,
    expenses,
    owners,
    payments,
    tenants,
    units,
)


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup (same schema as api.models). For production, use managed migrations."""
    import api.models  # noqa: F401 — register ORM mappers with Base.metadata
    from api.models import User

    Base.metadata.create_all(bind=engine)
    ensure_user_password_reset_columns(engine)

    # Pydantic EmailStr rejects .local; fix legacy bootstrap row so /auth/login can return UserRead.
    with SessionLocal() as db:
        db.execute(
            update(User)
            .where(User.email == "admin@muktasbat.local")
            .values(email="admin@muktasbat.app")
        )
        db.commit()

    # Ensure at least one administrator (role=admin) for local/dev when bootstrap is enabled.
    if os.environ.get("DISABLE_BOOTSTRAP_ADMIN", "").lower() not in ("1", "true", "yes"):
        with SessionLocal() as db:
            n = db.scalar(select(func.count()).select_from(User))
            admin_count = db.scalar(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            if n == 0:
                admin = User(
                    username="admin",
                    email="admin@muktasbat.app",
                    role="admin",
                )
                admin.set_password("admin123")
                db.add(admin)
                db.commit()
                logger.warning(
                    "Created default admin user (username=admin). "
                    "Set DISABLE_BOOTSTRAP_ADMIN=1 after creating real users, "
                    "and change this password in production."
                )
            elif admin_count == 0:
                by_name = db.scalar(select(User).where(User.username == "admin"))
                if by_name is not None:
                    by_name.role = "admin"
                    db.commit()
                    logger.warning(
                        "Promoted user 'admin' to administrator role (no admin existed). "
                        "Change password if this account was not meant to be privileged."
                    )
                else:
                    email = "admin@muktasbat.app"
                    if db.scalar(select(User).where(User.email == email)):
                        email = "bootstrap-admin@muktasbat.app"
                    admin = User(username="admin", email=email, role="admin")
                    admin.set_password("admin123")
                    db.add(admin)
                    db.commit()
                    logger.warning(
                        "Created default admin user (username=admin) because no administrator "
                        "was present. Set DISABLE_BOOTSTRAP_ADMIN=1 in production when appropriate."
                    )

    yield


settings = get_settings()

app = FastAPI(
    title="Muktasabat API",
    description="Real estate property management API for Saudi market",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


API_V1 = "/api/v1"
app.include_router(auth.router, prefix=API_V1)
app.include_router(owners.router, prefix=API_V1)
app.include_router(buildings.router, prefix=API_V1)
app.include_router(units.router, prefix=API_V1)
app.include_router(tenants.router, prefix=API_V1)
app.include_router(contracts.router, prefix=API_V1)
app.include_router(payments.router, prefix=API_V1)
app.include_router(employees.router, prefix=API_V1)
app.include_router(expenses.router, prefix=API_V1)
app.include_router(analytics.router, prefix=API_V1)

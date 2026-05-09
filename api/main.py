from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings
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

settings = get_settings()

app = FastAPI(
    title="Muktasabat API",
    description="Real estate property management API for Saudi market",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
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

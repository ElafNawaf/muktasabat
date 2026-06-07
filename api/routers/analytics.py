"""Enterprise analytics — portfolio KPIs, collection aging, cash flow, yield analysis.

These endpoints power the manager-side dashboards. Read-only.
"""
from datetime import date, timedelta
from typing import Annotated

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from api.deps import CurrentUser, DbSession
from api.i18n import Locale, get_locale, localized_value
from api.models import (
    Building,
    Contract,
    Employee,
    Expense,
    Owner,
    Payment,
    PaymentSplit,
    SubscriptionInvoice,
    Unit,
)
from api.schemas.analytics import (
    AgingBucket,
    AgingItem,
    AgingResponse,
    BuildingYield,
    CompanyIncome,
    ContractIntelResponse,
    EmployeePerformance,
    EmployeePerformanceResponse,
    ExpenseAnalyticsResponse,
    ExpenseByCategory,
    ExpenseByOwner,
    MonthlyAmount,
    MonthlyRevenue,
    OccupancyPoint,
    OwnerHeader,
    OwnerStatementResponse,
    OwnerStatementSummary,
    PipelineBucket,
    PipelineItem,
    PortfolioCounts,
    PortfolioResponse,
    RecentExpense,
    RevenueSummary,
    RevenueTrendsResponse,
    StatementExpenseRow,
    StatementRentRow,
    YieldAnalysisResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

LocaleDep = Annotated[Locale, Depends(get_locale)]


# ───────────────────────── PORTFOLIO OVERVIEW ─────────────────────────

@router.get("/portfolio", response_model=PortfolioResponse)
def portfolio_overview(db: DbSession, _user: CurrentUser):
    today = date.today()

    owners_count = db.scalar(select(func.count(Owner.id))) or 0
    buildings_count = db.scalar(select(func.count(Building.id))) or 0
    total_units = db.scalar(select(func.count(Unit.id))) or 0
    occupied = db.scalar(select(func.count(Unit.id)).where(Unit.is_available.is_(False))) or 0
    vacancy_rate = round(((total_units - occupied) / total_units * 100) if total_units else 0, 1)

    active_contracts = db.scalar(select(func.count(Contract.id)).where(Contract.status == "active")) or 0
    total_contracts = db.scalar(select(func.count(Contract.id))) or 0

    all_payments = db.scalars(select(Payment)).all()
    total_collected = sum(p.amount for p in all_payments if p.status == "paid")
    total_pending = sum(p.amount for p in all_payments if p.status == "pending")
    total_overdue = sum(
        p.amount for p in all_payments if p.status == "pending" and p.due_date < today
    )
    overdue_count = sum(
        1 for p in all_payments if p.status == "pending" and p.due_date < today
    )

    past_payments = [p for p in all_payments if p.due_date <= today]
    past_due_total = sum(p.amount for p in past_payments)
    past_paid_total = sum(p.amount for p in past_payments if p.status == "paid")
    collection_rate = round((past_paid_total / past_due_total * 100) if past_due_total else 100, 1)

    active = db.scalars(select(Contract).where(Contract.status == "active")).all()
    monthly_potential = sum(c.rent_amount for c in active)

    mgmt_income = db.scalar(
        select(func.coalesce(func.sum(PaymentSplit.amount), 0)).where(
            PaymentSplit.split_type == "management_fee"
        )
    ) or 0
    agent_income = db.scalar(
        select(func.coalesce(func.sum(PaymentSplit.amount), 0)).where(
            PaymentSplit.split_type == "agent_fee"
        )
    ) or 0
    total_expenses = db.scalar(select(func.coalesce(func.sum(Expense.amount), 0))) or 0
    sub_revenue = db.scalar(
        select(func.coalesce(func.sum(SubscriptionInvoice.amount), 0)).where(
            SubscriptionInvoice.status == "paid"
        )
    ) or 0

    return PortfolioResponse(
        portfolio=PortfolioCounts(
            owners=owners_count,
            buildings=buildings_count,
            total_units=total_units,
            occupied_units=occupied,
            vacancy_rate=vacancy_rate,
            active_contracts=active_contracts,
            total_contracts=total_contracts,
        ),
        revenue=RevenueSummary(
            total_collected=round(total_collected, 2),
            total_pending=round(total_pending, 2),
            total_overdue=round(total_overdue, 2),
            overdue_count=overdue_count,
            collection_rate=collection_rate,
            monthly_potential=round(monthly_potential, 2),
        ),
        company_income=CompanyIncome(
            management_fees=round(float(mgmt_income), 2),
            agent_fees=round(float(agent_income), 2),
            subscription_revenue=round(float(sub_revenue), 2),
            total_expenses=round(float(total_expenses), 2),
        ),
    )


# ───────────────────────── REVENUE TRENDS (12mo) ─────────────────────────

@router.get("/revenue-trends", response_model=RevenueTrendsResponse)
def revenue_trends(db: DbSession, _user: CurrentUser):
    today = date.today()
    months: list[MonthlyRevenue] = []

    for i in range(11, -1, -1):
        d = today - relativedelta(months=i)
        m_start = d.replace(day=1)
        m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)

        collected = db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == "paid",
                Payment.paid_date >= m_start,
                Payment.paid_date <= m_end,
            )
        ) or 0
        expected = db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.due_date >= m_start, Payment.due_date <= m_end
            )
        ) or 0
        mgmt_fees = db.scalar(
            select(func.coalesce(func.sum(PaymentSplit.amount), 0)).where(
                PaymentSplit.split_type == "management_fee",
                PaymentSplit.payment_id.in_(
                    select(Payment.id).where(
                        Payment.paid_date >= m_start, Payment.paid_date <= m_end
                    )
                ),
            )
        ) or 0
        expenses = db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.expense_date >= m_start, Expense.expense_date <= m_end
            )
        ) or 0

        months.append(
            MonthlyRevenue(
                label=d.strftime("%Y-%m"),
                collected=round(float(collected), 2),
                expected=round(float(expected), 2),
                mgmt_fees=round(float(mgmt_fees), 2),
                expenses=round(float(expenses), 2),
            )
        )
    return RevenueTrendsResponse(months=months)


# ───────────────────────── AGING RECEIVABLES ─────────────────────────

@router.get("/aging", response_model=AgingResponse)
def aging_receivables(db: DbSession, _user: CurrentUser, locale: LocaleDep):
    today = date.today()
    overdue = db.scalars(
        select(Payment).where(Payment.status == "pending", Payment.due_date < today)
    ).all()

    bucket_keys = ("1_30", "31_60", "61_90", "90_plus")
    buckets: dict[str, list[AgingItem]] = {k: [] for k in bucket_keys}

    for p in overdue:
        days = (today - p.due_date).days
        item = AgingItem(
            payment_id=p.id,
            contract_number=p.contract.contract_number,
            tenant=localized_value(p.contract.tenant, "name", locale),
            tenant_phone=p.contract.tenant.phone,
            unit=p.contract.unit.number,
            building=localized_value(p.contract.unit.building, "name", locale),
            owner=localized_value(p.contract.unit.building.owner, "name", locale),
            amount=round(p.amount, 2),
            due_date=p.due_date.isoformat(),
            days_overdue=days,
        )
        if days <= 30:
            buckets["1_30"].append(item)
        elif days <= 60:
            buckets["31_60"].append(item)
        elif days <= 90:
            buckets["61_90"].append(item)
        else:
            buckets["90_plus"].append(item)

    return AgingResponse(
        buckets={
            k: AgingBucket(
                count=len(items),
                amount=round(sum(it.amount for it in items), 2),
                items=items,
            )
            for k, items in buckets.items()
        },
        total_overdue=round(sum(p.amount for p in overdue), 2),
        total_count=len(overdue),
    )


# ───────────────────────── CONTRACT INTELLIGENCE ─────────────────────────

@router.get("/contract-intel", response_model=ContractIntelResponse)
def contract_intelligence(db: DbSession, _user: CurrentUser, locale: LocaleDep):
    today = date.today()
    active = db.scalars(select(Contract).where(Contract.status == "active")).all()

    bucket_keys = ("30", "60", "90", "180", "safe")
    pipeline: dict[str, list[PipelineItem]] = {k: [] for k in bucket_keys}

    for c in active:
        days_left = (c.end_date - today).days
        item = PipelineItem(
            id=c.id,
            contract_number=c.contract_number,
            tenant=localized_value(c.tenant, "name", locale),
            tenant_phone=c.tenant.phone,
            unit=c.unit.number,
            building=localized_value(c.unit.building, "name", locale),
            owner=localized_value(c.unit.building.owner, "name", locale),
            end_date=c.end_date.isoformat(),
            days_left=days_left,
            monthly_rent=round(c.rent_amount, 2),
            annual_value=round(c.rent_amount * 12, 2),
        )
        if days_left <= 30:
            pipeline["30"].append(item)
        elif days_left <= 60:
            pipeline["60"].append(item)
        elif days_left <= 90:
            pipeline["90"].append(item)
        elif days_left <= 180:
            pipeline["180"].append(item)
        else:
            pipeline["safe"].append(item)

    occ_trend: list[OccupancyPoint] = []
    for i in range(5, -1, -1):
        d = today - relativedelta(months=i)
        m_start = d.replace(day=1)
        m_end = m_start + relativedelta(months=1) - timedelta(days=1)
        active_then = db.scalar(
            select(func.count(Contract.id)).where(
                Contract.start_date <= m_end,
                Contract.end_date >= m_start,
                Contract.status.in_(["active", "expired"]),
            )
        ) or 0
        total = db.scalar(select(func.count(Unit.id))) or 0
        occ_trend.append(
            OccupancyPoint(
                label=d.strftime("%Y-%m"),
                occupied=active_then,
                total=total,
                rate=round(active_then / total * 100, 1) if total else 0,
            )
        )

    at_risk = sum(
        item.annual_value for item in pipeline["30"] + pipeline["60"] + pipeline["90"]
    )

    return ContractIntelResponse(
        pipeline={
            k: PipelineBucket(
                count=len(items),
                items=items,
                monthly_rent=round(sum(it.monthly_rent for it in items), 2),
            )
            for k, items in pipeline.items()
        },
        occupancy_trend=occ_trend,
        revenue_at_risk=round(at_risk, 2),
        active_count=len(active),
        total_annual_value=round(sum(c.rent_amount * 12 for c in active), 2),
    )


# ───────────────────────── EXPENSE ANALYTICS ─────────────────────────

@router.get("/expenses", response_model=ExpenseAnalyticsResponse)
def expense_analytics(db: DbSession, _user: CurrentUser, locale: LocaleDep):
    today = date.today()
    year_start = today.replace(month=1, day=1)

    by_cat = db.execute(
        select(Expense.category, func.sum(Expense.amount), func.count(Expense.id))
        .where(Expense.expense_date >= year_start)
        .group_by(Expense.category)
    ).all()
    categories = [
        ExpenseByCategory(category=c, amount=round(float(a), 2), count=int(n))
        for c, a, n in by_cat
    ]

    monthly: list[MonthlyAmount] = []
    for i in range(11, -1, -1):
        d = today - relativedelta(months=i)
        m_start = d.replace(day=1)
        m_end = m_start + relativedelta(months=1) - timedelta(days=1)
        total = db.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.expense_date >= m_start, Expense.expense_date <= m_end
            )
        ) or 0
        monthly.append(MonthlyAmount(label=d.strftime("%Y-%m"), amount=round(float(total), 2)))

    by_owner_rows = db.execute(
        select(Owner.id, func.sum(Expense.amount))
        .join(Expense, Expense.owner_id == Owner.id)
        .where(Expense.expense_date >= year_start)
        .group_by(Owner.id)
        .order_by(func.sum(Expense.amount).desc())
        .limit(10)
    ).all()
    by_owner = [
        ExpenseByOwner(
            owner=localized_value(db.get(Owner, oid), "name", locale),
            amount=round(float(a), 2),
        )
        for oid, a in by_owner_rows
    ]

    recent_rows = db.scalars(
        select(Expense).order_by(Expense.expense_date.desc()).limit(20)
    ).all()
    recent = [
        RecentExpense(
            id=e.id,
            category=e.category,
            description=localized_value(e, "description", locale),
            amount=round(e.amount, 2),
            date=e.expense_date.isoformat(),
            paid_by=e.paid_by,
            owner=localized_value(e.owner, "name", locale) if e.owner else "-",
            building=localized_value(e.building, "name", locale) if e.building else "-",
            vendor=e.vendor_name or "-",
        )
        for e in recent_rows
    ]

    year_total = db.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.expense_date >= year_start
        )
    ) or 0

    return ExpenseAnalyticsResponse(
        categories=categories,
        monthly=monthly,
        by_owner=by_owner,
        recent=recent,
        year_total=round(float(year_total), 2),
    )


# ───────────────────────── EMPLOYEE PERFORMANCE ─────────────────────────

@router.get("/employee-performance", response_model=EmployeePerformanceResponse)
def employee_perf(db: DbSession, _user: CurrentUser, locale: LocaleDep):
    today = date.today()
    employees = db.scalars(select(Employee)).all()
    result: list[EmployeePerformance] = []

    for emp in employees:
        owners = emp.owners
        owner_ids = [o.id for o in owners]
        if not owner_ids:
            result.append(
                EmployeePerformance(
                    name=localized_value(emp, "name", locale),
                    phone=emp.phone,
                    owners=0, buildings=0, units=0,
                    collection_rate=0, overdue_amount=0, monthly_revenue=0,
                )
            )
            continue

        buildings = db.scalars(
            select(Building).where(Building.owner_id.in_(owner_ids))
        ).all()
        building_ids = [b.id for b in buildings]
        units = (
            db.scalars(select(Unit).where(Unit.building_id.in_(building_ids))).all()
            if building_ids else []
        )
        unit_ids = [u.id for u in units]
        contracts = (
            db.scalars(select(Contract).where(Contract.unit_id.in_(unit_ids))).all()
            if unit_ids else []
        )
        contract_ids = [c.id for c in contracts]
        payments = (
            db.scalars(select(Payment).where(Payment.contract_id.in_(contract_ids))).all()
            if contract_ids else []
        )

        past_payments = [p for p in payments if p.due_date <= today]
        past_due = sum(p.amount for p in past_payments)
        past_paid = sum(p.amount for p in past_payments if p.status == "paid")
        coll_rate = round(past_paid / past_due * 100, 1) if past_due else 100

        overdue = sum(
            p.amount for p in payments if p.status == "pending" and p.due_date < today
        )
        monthly_rev = sum(c.rent_amount for c in contracts if c.status == "active")

        result.append(
            EmployeePerformance(
                name=localized_value(emp, "name", locale),
                phone=emp.phone,
                owners=len(owners),
                buildings=len(buildings),
                units=len(units),
                active_contracts=sum(1 for c in contracts if c.status == "active"),
                collection_rate=coll_rate,
                overdue_amount=round(overdue, 2),
                monthly_revenue=round(monthly_rev, 2),
                total_collected=round(past_paid, 2),
            )
        )

    result.sort(key=lambda x: x.collection_rate, reverse=True)
    return EmployeePerformanceResponse(employees=result)


# ───────────────────────── OWNER STATEMENT ─────────────────────────

@router.get("/owner-statement/{owner_id}", response_model=OwnerStatementResponse)
def owner_statement(
    owner_id: int,
    db: DbSession,
    _user: CurrentUser,
    locale: LocaleDep,
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
):
    owner = db.get(Owner, owner_id)
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Owner not found")

    m_start = date(year, month, 1)
    m_end = m_start + relativedelta(months=1) - timedelta(days=1)

    all_units = [u for b in owner.buildings for u in b.units]
    all_contracts = [c for u in all_units for c in u.contracts]

    rent_rows: list[StatementRentRow] = []
    total_rent = total_mgmt = total_agent = total_ejar = total_owner_share = 0.0

    for c in all_contracts:
        for p in c.payments:
            if not (m_start <= p.due_date <= m_end):
                continue
            mgmt = p.amount * (c.unit.management_percentage or 0) / 100
            agent_pct = c.agent_percentage if c.agent_percentage else (c.unit.agent_percentage or 0)
            agent = p.amount * agent_pct / 100
            ejar = c.unit.ejar_fee or 0
            owner_share = p.amount - mgmt - agent - ejar

            rent_rows.append(
                StatementRentRow(
                    date=p.due_date.isoformat(),
                    description=(
                        f'{localized_value(c.unit.building, "name", locale)} - '
                        f'Unit {c.unit.number} ({localized_value(c.tenant, "name", locale)})'
                    ),
                    gross=round(p.amount, 2),
                    mgmt_fee=round(mgmt, 2),
                    agent_fee=round(agent, 2),
                    ejar_fee=round(ejar, 2),
                    net=round(owner_share, 2),
                    status=p.status,
                )
            )
            total_rent += p.amount
            total_mgmt += mgmt
            total_agent += agent
            total_ejar += ejar
            total_owner_share += owner_share

    expenses = db.scalars(
        select(Expense).where(
            Expense.owner_id == owner.id,
            Expense.expense_date >= m_start,
            Expense.expense_date <= m_end,
        )
    ).all()
    expense_rows = [
        StatementExpenseRow(
            date=e.expense_date.isoformat(),
            description=f'{e.category}: {localized_value(e, "description", locale)}',
            amount=round(e.amount, 2),
            paid_by=e.paid_by,
        )
        for e in expenses
    ]

    total_expenses = sum(e.amount for e in expenses if e.paid_by == "owner")
    sub = owner.subscription
    sub_fee = sub.price_monthly if sub and sub.status == "active" else 0
    net_payable = total_owner_share - total_expenses - sub_fee

    return OwnerStatementResponse(
        owner=OwnerHeader(
            id=owner.id,
            name=localized_value(owner, "name", locale),
            iban=owner.iban,
            bank_name=owner.bank_name,
        ),
        period=f"{year}-{month:02d}",
        period_start=m_start.isoformat(),
        period_end=m_end.isoformat(),
        rent_rows=rent_rows,
        expense_rows=expense_rows,
        summary=OwnerStatementSummary(
            total_rent=round(total_rent, 2),
            total_mgmt_fee=round(total_mgmt, 2),
            total_agent_fee=round(total_agent, 2),
            total_ejar_fee=round(total_ejar, 2),
            total_owner_share=round(total_owner_share, 2),
            total_expenses=round(total_expenses, 2),
            subscription_fee=round(sub_fee, 2),
            net_payable=round(net_payable, 2),
        ),
    )


# ───────────────────────── BUILDING YIELD ─────────────────────────

@router.get("/yield-analysis", response_model=YieldAnalysisResponse)
def yield_analysis(db: DbSession, _user: CurrentUser, locale: LocaleDep):
    buildings = db.scalars(select(Building)).all()
    result: list[BuildingYield] = []

    for b in buildings:
        total_units = len(b.units)
        occupied = sum(1 for u in b.units if not u.is_available)
        total_area = sum(u.area_sqm or 0 for u in b.units)
        monthly_rent = sum(
            c.rent_amount for u in b.units for c in u.contracts if c.status == "active"
        )
        annual_rent = monthly_rent * 12
        total_expenses = sum(e.amount for e in b.expenses)
        net_income = annual_rent - total_expenses
        rent_per_sqm = round(monthly_rent / total_area, 2) if total_area else 0
        occ_rate = round(occupied / total_units * 100, 1) if total_units else 0

        result.append(
            BuildingYield(
                id=b.id,
                name=localized_value(b, "name", locale),
                owner=localized_value(b.owner, "name", locale),
                city=localized_value(b, "city", locale),
                district=localized_value(b, "district", locale),
                total_units=total_units,
                occupied=occupied,
                occupancy_rate=occ_rate,
                total_area_sqm=round(total_area, 0),
                monthly_rent=round(monthly_rent, 2),
                annual_rent=round(annual_rent, 2),
                annual_expenses=round(total_expenses, 2),
                net_income=round(net_income, 2),
                rent_per_sqm=rent_per_sqm,
            )
        )

    result.sort(key=lambda x: x.net_income, reverse=True)
    return YieldAnalysisResponse(buildings=result)

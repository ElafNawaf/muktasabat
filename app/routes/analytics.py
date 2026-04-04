"""Enterprise analytics API — portfolio KPIs, collection aging, cash flow, yield analysis."""
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request, render_template
from flask_login import login_required, current_user
from sqlalchemy import func
from app import db
from app.i18n_data import localized_value
from app.models import (
    Owner, Building, Unit, Contract, Payment, PaymentSplit, Expense, Employee,
    Subscription, employee_owners,
)

analytics_bp = Blueprint('analytics', __name__, url_prefix='/analytics')


# ══════════════════════════════════════════════════════════════════════
#  COMPANY DASHBOARD PAGE
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/dashboard')
@login_required
def company_dashboard():
    return render_template('analytics/company_dashboard.html')


@analytics_bp.route('/collections')
@login_required
def collections_page():
    return render_template('analytics/collections.html')


@analytics_bp.route('/contracts-intel')
@login_required
def contracts_intel_page():
    return render_template('analytics/contracts_intel.html')


@analytics_bp.route('/expenses')
@login_required
def expenses_page():
    return render_template('analytics/expenses.html')


@analytics_bp.route('/employee-performance')
@login_required
def employee_performance_page():
    return render_template('analytics/employee_performance.html')


# ══════════════════════════════════════════════════════════════════════
#  API: PORTFOLIO OVERVIEW (company-wide KPIs)
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/portfolio')
@login_required
def portfolio_overview():
    today = date.today()

    owners_count = Owner.query.count()
    buildings_count = Building.query.count()
    total_units = Unit.query.count()
    occupied = Unit.query.filter_by(is_available=False).count()
    vacancy_rate = round(((total_units - occupied) / total_units * 100) if total_units else 0, 1)

    active_contracts = Contract.query.filter_by(status='active').count()
    total_contracts = Contract.query.count()

    # Revenue metrics
    all_payments = Payment.query.all()
    total_collected = sum(p.amount for p in all_payments if p.status == 'paid')
    total_pending = sum(p.amount for p in all_payments if p.status == 'pending')
    total_overdue = sum(p.amount for p in all_payments if p.status == 'pending' and p.due_date < today)
    overdue_count = sum(1 for p in all_payments if p.status == 'pending' and p.due_date < today)

    # Collection rate (paid / total due for past payments)
    past_payments = [p for p in all_payments if p.due_date <= today]
    past_due_total = sum(p.amount for p in past_payments)
    past_paid_total = sum(p.amount for p in past_payments if p.status == 'paid')
    collection_rate = round((past_paid_total / past_due_total * 100) if past_due_total else 100, 1)

    # Monthly rent potential (sum of all active contract monthly rents)
    active = Contract.query.filter_by(status='active').all()
    monthly_potential = sum(c.rent_amount for c in active)

    # Fee income (from payment splits)
    mgmt_income = db.session.query(func.coalesce(func.sum(PaymentSplit.amount), 0)).filter(
        PaymentSplit.split_type == 'management_fee'
    ).scalar()
    agent_income = db.session.query(func.coalesce(func.sum(PaymentSplit.amount), 0)).filter(
        PaymentSplit.split_type == 'agent_fee'
    ).scalar()

    # Total expenses
    total_expenses = db.session.query(func.coalesce(func.sum(Expense.amount), 0)).scalar()

    # Subscription revenue
    from app.models import SubscriptionInvoice
    sub_revenue = db.session.query(func.coalesce(func.sum(SubscriptionInvoice.amount), 0)).filter(
        SubscriptionInvoice.status == 'paid'
    ).scalar()

    return jsonify({
        'portfolio': {
            'owners': owners_count,
            'buildings': buildings_count,
            'total_units': total_units,
            'occupied_units': occupied,
            'vacancy_rate': vacancy_rate,
            'active_contracts': active_contracts,
            'total_contracts': total_contracts,
        },
        'revenue': {
            'total_collected': round(total_collected, 2),
            'total_pending': round(total_pending, 2),
            'total_overdue': round(total_overdue, 2),
            'overdue_count': overdue_count,
            'collection_rate': collection_rate,
            'monthly_potential': round(monthly_potential, 2),
        },
        'company_income': {
            'management_fees': round(float(mgmt_income), 2),
            'agent_fees': round(float(agent_income), 2),
            'subscription_revenue': round(float(sub_revenue), 2),
            'total_expenses': round(float(total_expenses), 2),
        },
    })


# ══════════════════════════════════════════════════════════════════════
#  API: REVENUE TRENDS (monthly, last 12 months)
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/revenue-trends')
@login_required
def revenue_trends():
    today = date.today()
    months = []
    for i in range(11, -1, -1):
        d = today - relativedelta(months=i)
        m_start = d.replace(day=1)
        m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)
        label = d.strftime('%Y-%m')

        collected = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == 'paid', Payment.paid_date >= m_start, Payment.paid_date <= m_end
        ).scalar()
        expected = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.due_date >= m_start, Payment.due_date <= m_end
        ).scalar()
        mgmt_fees = db.session.query(func.coalesce(func.sum(PaymentSplit.amount), 0)).filter(
            PaymentSplit.split_type == 'management_fee',
            PaymentSplit.payment_id.in_(
                db.session.query(Payment.id).filter(Payment.paid_date >= m_start, Payment.paid_date <= m_end)
            )
        ).scalar()
        expenses = db.session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
            Expense.expense_date >= m_start, Expense.expense_date <= m_end
        ).scalar()

        months.append({
            'label': label,
            'collected': round(float(collected), 2),
            'expected': round(float(expected), 2),
            'mgmt_fees': round(float(mgmt_fees), 2),
            'expenses': round(float(expenses), 2),
        })

    return jsonify({'months': months})


# ══════════════════════════════════════════════════════════════════════
#  API: AGING RECEIVABLES (collection management)
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/aging')
@login_required
def aging_receivables():
    today = date.today()
    overdue = Payment.query.filter(Payment.status == 'pending', Payment.due_date < today).all()

    buckets = {'1_30': [], '31_60': [], '61_90': [], '90_plus': []}
    for p in overdue:
        days = (today - p.due_date).days
        row = {
            'payment_id': p.id,
            'contract_number': p.contract.contract_number,
            'tenant': localized_value(p.contract.tenant, 'name'),
            'tenant_phone': p.contract.tenant.phone,
            'unit': p.contract.unit.number,
            'building': localized_value(p.contract.unit.building, 'name'),
            'owner': localized_value(p.contract.unit.building.owner, 'name'),
            'amount': round(p.amount, 2),
            'due_date': p.due_date.isoformat(),
            'days_overdue': days,
        }
        if days <= 30:
            buckets['1_30'].append(row)
        elif days <= 60:
            buckets['31_60'].append(row)
        elif days <= 90:
            buckets['61_90'].append(row)
        else:
            buckets['90_plus'].append(row)

    return jsonify({
        'buckets': {
            '1_30':    {'count': len(buckets['1_30']),    'amount': round(sum(r['amount'] for r in buckets['1_30']), 2),    'items': buckets['1_30']},
            '31_60':   {'count': len(buckets['31_60']),   'amount': round(sum(r['amount'] for r in buckets['31_60']), 2),   'items': buckets['31_60']},
            '61_90':   {'count': len(buckets['61_90']),   'amount': round(sum(r['amount'] for r in buckets['61_90']), 2),   'items': buckets['61_90']},
            '90_plus': {'count': len(buckets['90_plus']), 'amount': round(sum(r['amount'] for r in buckets['90_plus']), 2), 'items': buckets['90_plus']},
        },
        'total_overdue': round(sum(p.amount for p in overdue), 2),
        'total_count': len(overdue),
    })


# ══════════════════════════════════════════════════════════════════════
#  API: CONTRACT INTELLIGENCE
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/contract-intel')
@login_required
def contract_intelligence():
    today = date.today()
    active = Contract.query.filter_by(status='active').all()

    # Expiring pipeline
    pipeline = {'30': [], '60': [], '90': [], '180': [], 'safe': []}
    for c in active:
        days_left = (c.end_date - today).days
        row = {
            'id': c.id,
            'contract_number': c.contract_number,
            'tenant': localized_value(c.tenant, 'name'),
            'tenant_phone': c.tenant.phone,
            'unit': c.unit.number,
            'building': localized_value(c.unit.building, 'name'),
            'owner': localized_value(c.unit.building.owner, 'name'),
            'end_date': c.end_date.isoformat(),
            'days_left': days_left,
            'monthly_rent': round(c.rent_amount, 2),
            'annual_value': round(c.rent_amount * 12, 2),
        }
        if days_left <= 30:
            pipeline['30'].append(row)
        elif days_left <= 60:
            pipeline['60'].append(row)
        elif days_left <= 90:
            pipeline['90'].append(row)
        elif days_left <= 180:
            pipeline['180'].append(row)
        else:
            pipeline['safe'].append(row)

    # Occupancy trend (monthly for last 6 months — approximate from contract dates)
    occ_trend = []
    for i in range(5, -1, -1):
        d = today - relativedelta(months=i)
        m_end = d.replace(day=1) + relativedelta(months=1) - timedelta(days=1)
        active_then = Contract.query.filter(
            Contract.start_date <= m_end,
            Contract.end_date >= d.replace(day=1),
            Contract.status.in_(['active', 'expired']),
        ).count()
        total = Unit.query.count()
        occ_trend.append({
            'label': d.strftime('%Y-%m'),
            'occupied': active_then,
            'total': total,
            'rate': round(active_then / total * 100, 1) if total else 0,
        })

    # Revenue at risk (contracts expiring in 90 days)
    at_risk = sum(r['annual_value'] for r in pipeline['30'] + pipeline['60'] + pipeline['90'])

    return jsonify({
        'pipeline': {k: {'count': len(v), 'items': v, 'monthly_rent': round(sum(r['monthly_rent'] for r in v), 2)} for k, v in pipeline.items()},
        'occupancy_trend': occ_trend,
        'revenue_at_risk': round(at_risk, 2),
        'active_count': len(active),
        'total_annual_value': round(sum(c.rent_amount * 12 for c in active), 2),
    })


# ══════════════════════════════════════════════════════════════════════
#  API: EXPENSE ANALYTICS
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/expenses')
@login_required
def expense_analytics():
    today = date.today()
    year_start = today.replace(month=1, day=1)

    # By category
    by_cat = db.session.query(
        Expense.category, func.sum(Expense.amount), func.count(Expense.id)
    ).filter(Expense.expense_date >= year_start).group_by(Expense.category).all()

    categories = [{'category': c, 'amount': round(float(a), 2), 'count': int(n)} for c, a, n in by_cat]

    # Monthly trend
    monthly = []
    for i in range(11, -1, -1):
        d = today - relativedelta(months=i)
        m_start = d.replace(day=1)
        m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)
        total = db.session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
            Expense.expense_date >= m_start, Expense.expense_date <= m_end
        ).scalar()
        monthly.append({'label': d.strftime('%Y-%m'), 'amount': round(float(total), 2)})

    # Top owners by expense (group by id so localized display name is correct)
    by_owner = db.session.query(
        Owner.id, func.sum(Expense.amount)
    ).join(Expense, Expense.owner_id == Owner.id).filter(
        Expense.expense_date >= year_start
    ).group_by(Owner.id).order_by(func.sum(Expense.amount).desc()).limit(10).all()

    # Recent expenses
    recent = Expense.query.order_by(Expense.expense_date.desc()).limit(20).all()
    recent_list = [{
        'id': e.id,
        'category': e.category,
        'description': localized_value(e, 'description'),
        'amount': round(e.amount, 2),
        'date': e.expense_date.isoformat(),
        'paid_by': e.paid_by,
        'owner': localized_value(e.owner, 'name') if e.owner else '-',
        'building': localized_value(e.building, 'name') if e.building else '-',
        'vendor': e.vendor_name or '-',
    } for e in recent]

    year_total = db.session.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        Expense.expense_date >= year_start
    ).scalar()

    return jsonify({
        'categories': categories,
        'monthly': monthly,
        'by_owner': [{
            'owner': localized_value(db.session.get(Owner, oid), 'name'),
            'amount': round(float(a), 2),
        } for oid, a in by_owner],
        'recent': recent_list,
        'year_total': round(float(year_total), 2),
    })


# ══════════════════════════════════════════════════════════════════════
#  API: EMPLOYEE PERFORMANCE
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/employee-performance')
@login_required
def employee_perf():
    today = date.today()
    employees = Employee.query.all()
    result = []

    for emp in employees:
        owners = emp.owners
        owner_ids = [o.id for o in owners]
        if not owner_ids:
            result.append({'name': localized_value(emp, 'name'), 'phone': emp.phone, 'owners': 0, 'buildings': 0, 'units': 0, 'collection_rate': 0, 'overdue_amount': 0, 'monthly_revenue': 0})
            continue

        buildings = Building.query.filter(Building.owner_id.in_(owner_ids)).all()
        building_ids = [b.id for b in buildings]
        units = Unit.query.filter(Unit.building_id.in_(building_ids)).all() if building_ids else []
        unit_ids = [u.id for u in units]
        contracts = Contract.query.filter(Contract.unit_id.in_(unit_ids)).all() if unit_ids else []
        contract_ids = [c.id for c in contracts]
        payments = Payment.query.filter(Payment.contract_id.in_(contract_ids)).all() if contract_ids else []

        past_payments = [p for p in payments if p.due_date <= today]
        past_due = sum(p.amount for p in past_payments)
        past_paid = sum(p.amount for p in past_payments if p.status == 'paid')
        coll_rate = round(past_paid / past_due * 100, 1) if past_due else 100

        overdue = sum(p.amount for p in payments if p.status == 'pending' and p.due_date < today)
        monthly_rev = sum(c.rent_amount for c in contracts if c.status == 'active')

        result.append({
            'name': localized_value(emp, 'name'),
            'phone': emp.phone,
            'owners': len(owners),
            'buildings': len(buildings),
            'units': len(units),
            'active_contracts': sum(1 for c in contracts if c.status == 'active'),
            'collection_rate': coll_rate,
            'overdue_amount': round(overdue, 2),
            'monthly_revenue': round(monthly_rev, 2),
            'total_collected': round(past_paid, 2),
        })

    result.sort(key=lambda x: x['collection_rate'], reverse=True)
    return jsonify({'employees': result})


# ══════════════════════════════════════════════════════════════════════
#  API: OWNER STATEMENTS (monthly reconciliation)
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/owner-statement/<int:owner_id>')
@login_required
def owner_statement(owner_id):
    owner = db.session.get(Owner, owner_id)
    if not owner:
        return jsonify({'error': 'Owner not found'}), 404

    year = request.args.get('year', date.today().year, type=int)
    month = request.args.get('month', date.today().month, type=int)
    m_start = date(year, month, 1)
    m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)

    all_units = [u for b in owner.buildings for u in b.units]
    all_contracts = [c for u in all_units for c in u.contracts]

    # Rent collected
    rent_rows = []
    total_rent = 0
    total_mgmt = 0
    total_agent = 0
    total_ejar = 0
    total_owner_share = 0

    for c in all_contracts:
        for p in c.payments:
            if m_start <= p.due_date <= m_end:
                mgmt = p.amount * (c.unit.management_percentage or 0) / 100
                agent = p.amount * (c.unit.agent_percentage or 0) / 100
                ejar = c.unit.ejar_fee or 0
                owner_share = p.amount - mgmt - agent - ejar

                rent_rows.append({
                    'type': 'rent',
                    'date': p.due_date.isoformat(),
                    'description': f'{localized_value(c.unit.building, "name")} - Unit {c.unit.number} ({localized_value(c.tenant, "name")})',
                    'gross': round(p.amount, 2),
                    'mgmt_fee': round(mgmt, 2),
                    'agent_fee': round(agent, 2),
                    'ejar_fee': round(ejar, 2),
                    'net': round(owner_share, 2),
                    'status': p.status,
                })
                total_rent += p.amount
                total_mgmt += mgmt
                total_agent += agent
                total_ejar += ejar
                total_owner_share += owner_share

    # Expenses charged to this owner
    expenses = Expense.query.filter(
        Expense.owner_id == owner.id,
        Expense.expense_date >= m_start,
        Expense.expense_date <= m_end,
    ).all()

    expense_rows = [{
        'type': 'expense',
        'date': e.expense_date.isoformat(),
        'description': f'{e.category}: {localized_value(e, "description")}',
        'amount': round(e.amount, 2),
        'paid_by': e.paid_by,
    } for e in expenses]

    total_expenses = sum(e.amount for e in expenses if e.paid_by == 'owner')

    # Subscription fee
    sub = owner.subscription
    sub_fee = sub.price_monthly if sub and sub.status == 'active' else 0

    net_payable = total_owner_share - total_expenses - sub_fee

    return jsonify({
        'owner': {'id': owner.id, 'name': localized_value(owner, 'name'), 'iban': owner.iban, 'bank_name': owner.bank_name},
        'period': f'{year}-{month:02d}',
        'period_start': m_start.isoformat(),
        'period_end': m_end.isoformat(),
        'rent_rows': rent_rows,
        'expense_rows': expense_rows,
        'summary': {
            'total_rent': round(total_rent, 2),
            'total_mgmt_fee': round(total_mgmt, 2),
            'total_agent_fee': round(total_agent, 2),
            'total_ejar_fee': round(total_ejar, 2),
            'total_owner_share': round(total_owner_share, 2),
            'total_expenses': round(total_expenses, 2),
            'subscription_fee': round(sub_fee, 2),
            'net_payable': round(net_payable, 2),
        },
    })


# ══════════════════════════════════════════════════════════════════════
#  API: BUILDING YIELD ANALYSIS
# ══════════════════════════════════════════════════════════════════════
@analytics_bp.route('/api/yield-analysis')
@login_required
def yield_analysis():
    buildings = Building.query.all()
    result = []
    for b in buildings:
        total_units = len(b.units)
        occupied = sum(1 for u in b.units if not u.is_available)
        total_area = sum(u.area_sqm or 0 for u in b.units)
        monthly_rent = sum(
            c.rent_amount for u in b.units for c in u.contracts if c.status == 'active'
        )
        annual_rent = monthly_rent * 12
        total_expenses = sum(e.amount for e in b.expenses)
        net_income = annual_rent - total_expenses
        rent_per_sqm = round(monthly_rent / total_area, 2) if total_area else 0
        occ_rate = round(occupied / total_units * 100, 1) if total_units else 0

        result.append({
            'id': b.id,
            'name': localized_value(b, 'name'),
            'owner': localized_value(b.owner, 'name'),
            'city': localized_value(b, 'city'),
            'district': localized_value(b, 'district'),
            'total_units': total_units,
            'occupied': occupied,
            'occupancy_rate': occ_rate,
            'total_area_sqm': round(total_area, 0),
            'monthly_rent': round(monthly_rent, 2),
            'annual_rent': round(annual_rent, 2),
            'annual_expenses': round(total_expenses, 2),
            'net_income': round(net_income, 2),
            'rent_per_sqm': rent_per_sqm,
        })

    result.sort(key=lambda x: x['net_income'], reverse=True)
    return jsonify({'buildings': result})

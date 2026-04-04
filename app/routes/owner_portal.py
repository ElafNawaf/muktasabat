"""Owner portal — dashboard with charts, financial reports, subscription management."""
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from flask_babel import _
from sqlalchemy import func, extract
from app import db
from app.i18n_data import localized_value
from app.models import (
    Owner, Building, Unit, Contract, Payment, PaymentSplit,
    Subscription, SubscriptionInvoice, OwnerUser,
)

owner_portal_bp = Blueprint('owner_portal', __name__, url_prefix='/portal')


def _get_owner():
    """Return the Owner linked to current_user, or None if admin."""
    if current_user.is_owner_user and current_user.linked_owner:
        return current_user.linked_owner
    return None


def _get_owner_or_selected():
    """For admins, allow ?owner_id= param. For owners, return their own."""
    owner = _get_owner()
    if owner:
        return owner
    # Admin selecting an owner
    owner_id = request.args.get('owner_id', type=int)
    if owner_id and current_user.is_admin:
        return db.session.get(Owner, owner_id)
    return None


# ── Owner Dashboard ──────────────────────────────────────────────────
@owner_portal_bp.route('/dashboard')
@login_required
def dashboard():
    owner = _get_owner_or_selected()
    owners_list = None
    if not owner and current_user.is_admin:
        owners_list = Owner.query.order_by(Owner.name).all()
    from datetime import date as d
    return render_template(
        'owner_portal/dashboard.html', owner=owner, owners_list=owners_list,
        today_month=d.today().month, today_year=d.today().year,
    )


# ── Dashboard API (JSON for Chart.js) ────────────────────────────────
@owner_portal_bp.route('/api/dashboard-data')
@login_required
def dashboard_data():
    owner = _get_owner_or_selected()
    if not owner:
        return jsonify({'error': 'No owner selected'}), 400

    today = date.today()
    buildings = owner.buildings
    all_units = [u for b in buildings for u in b.units]
    all_contracts = [c for u in all_units for c in u.contracts]
    active_contracts = [c for c in all_contracts if c.status == 'active']
    all_payments = [p for c in all_contracts for p in c.payments]

    total_units = len(all_units)
    occupied = sum(1 for u in all_units if not u.is_available)
    vacancy_rate = ((total_units - occupied) / total_units * 100) if total_units else 0

    # Monthly revenue for last 12 months
    monthly_revenue = []
    monthly_expected = []
    month_labels = []
    for i in range(11, -1, -1):
        d = today - relativedelta(months=i)
        month_start = d.replace(day=1)
        month_end = (month_start + relativedelta(months=1)) - timedelta(days=1)
        month_labels.append(d.strftime('%Y-%m'))

        collected = sum(
            p.amount for p in all_payments
            if p.status == 'paid' and p.paid_date and month_start <= p.paid_date <= month_end
        )
        expected = sum(
            p.amount for p in all_payments
            if month_start <= p.due_date <= month_end
        )
        monthly_revenue.append(round(collected, 2))
        monthly_expected.append(round(expected, 2))

    # Overdue payments
    overdue = [p for p in all_payments if p.status == 'pending' and p.due_date < today]
    overdue_amount = sum(p.amount for p in overdue)

    # Contracts expiring in 30/60/90 days
    expiring_30 = sum(1 for c in active_contracts if today <= c.end_date <= today + timedelta(days=30))
    expiring_60 = sum(1 for c in active_contracts if today + timedelta(days=31) <= c.end_date <= today + timedelta(days=60))
    expiring_90 = sum(1 for c in active_contracts if today + timedelta(days=61) <= c.end_date <= today + timedelta(days=90))

    # Total annual rent
    total_annual_rent = sum(c.rent_amount * 12 for c in active_contracts)
    total_annual_mgmt = sum(c.management_fee * 12 for c in active_contracts)
    total_annual_agent = sum(c.agent_fee * 12 for c in active_contracts)
    total_ejar_fees = sum(u.ejar_fee for u in all_units if u.ejar_fee)

    # Income breakdown (for pie chart)
    total_collected = sum(p.amount for p in all_payments if p.status == 'paid')
    total_pending = sum(p.amount for p in all_payments if p.status == 'pending')

    # Building performance
    building_data = []
    for b in buildings:
        b_units = len(b.units)
        b_occupied = sum(1 for u in b.units if not u.is_available)
        b_rent = sum(
            c.rent_amount for u in b.units for c in u.contracts if c.status == 'active'
        )
        building_data.append({
            'name': localized_value(b, 'name'),
            'units': b_units,
            'occupied': b_occupied,
            'monthly_rent': round(b_rent, 2),
        })

    # Net owner income (after fees)
    net_income = total_annual_rent - total_annual_mgmt - total_annual_agent - total_ejar_fees

    return jsonify({
        'summary': {
            'total_buildings': len(buildings),
            'total_units': total_units,
            'occupied_units': occupied,
            'vacancy_rate': round(vacancy_rate, 1),
            'active_contracts': len(active_contracts),
            'overdue_count': len(overdue),
            'overdue_amount': round(overdue_amount, 2),
            'total_annual_rent': round(total_annual_rent, 2),
            'total_annual_mgmt': round(total_annual_mgmt, 2),
            'total_annual_agent': round(total_annual_agent, 2),
            'total_ejar_fees': round(total_ejar_fees, 2),
            'net_annual_income': round(net_income, 2),
        },
        'expiring_contracts': {
            '30_days': expiring_30,
            '60_days': expiring_60,
            '90_days': expiring_90,
        },
        'monthly_chart': {
            'labels': month_labels,
            'collected': monthly_revenue,
            'expected': monthly_expected,
        },
        'income_pie': {
            'collected': round(total_collected, 2),
            'pending': round(total_pending, 2),
            'overdue': round(overdue_amount, 2),
        },
        'buildings': building_data,
    })


# ── Financial Report API ─────────────────────────────────────────────
@owner_portal_bp.route('/api/financial-report')
@login_required
def financial_report():
    owner = _get_owner_or_selected()
    if not owner:
        return jsonify({'error': 'No owner selected'}), 400

    # Period: default current month, or ?year=&month=
    year = request.args.get('year', date.today().year, type=int)
    month = request.args.get('month', date.today().month, type=int)
    period_start = date(year, month, 1)
    period_end = (period_start + relativedelta(months=1)) - timedelta(days=1)

    all_units = [u for b in owner.buildings for u in b.units]
    all_contracts = [c for u in all_units for c in u.contracts]
    all_payments = [p for c in all_contracts for p in c.payments]

    # Payments in this period
    period_payments = [
        p for p in all_payments
        if period_start <= p.due_date <= period_end
    ]

    collected = sum(p.amount for p in period_payments if p.status == 'paid')
    pending = sum(p.amount for p in period_payments if p.status == 'pending')

    # Fee calculations
    mgmt_fee_total = 0
    agent_fee_total = 0
    ejar_total = 0
    rows = []
    for p in period_payments:
        contract = p.contract
        unit = contract.unit
        building = unit.building
        mgmt = p.amount * (unit.management_percentage or 0) / 100
        agent = p.amount * (unit.agent_percentage or 0) / 100
        owner_share = p.amount - mgmt - agent
        mgmt_fee_total += mgmt
        agent_fee_total += agent

        rows.append({
            'building': localized_value(building, 'name'),
            'unit': unit.number,
            'tenant': localized_value(contract.tenant, 'name'),
            'due_date': p.due_date.isoformat(),
            'amount': round(p.amount, 2),
            'mgmt_fee': round(mgmt, 2),
            'agent_fee': round(agent, 2),
            'owner_share': round(owner_share, 2),
            'status': p.status,
            'paid_date': p.paid_date.isoformat() if p.paid_date else None,
        })

    # Count unique active ejar fees this period
    active_units_with_ejar = [u for u in all_units if u.ejar_fee and not u.is_available]
    ejar_total = sum(u.ejar_fee for u in active_units_with_ejar)

    net_owner = collected - mgmt_fee_total - agent_fee_total
    gross_rent = collected + pending

    return jsonify({
        'period': f'{year}-{month:02d}',
        'period_start': period_start.isoformat(),
        'period_end': period_end.isoformat(),
        'owner': {'id': owner.id, 'name': localized_value(owner, 'name')},
        'totals': {
            'gross_rent': round(gross_rent, 2),
            'collected': round(collected, 2),
            'pending': round(pending, 2),
            'management_fees': round(mgmt_fee_total, 2),
            'agent_fees': round(agent_fee_total, 2),
            'ejar_fees': round(ejar_total, 2),
            'net_owner_income': round(net_owner, 2),
        },
        'payments': rows,
    })


# ── Subscription Management ──────────────────────────────────────────
@owner_portal_bp.route('/subscription')
@login_required
def subscription_page():
    owner = _get_owner_or_selected()
    if not owner:
        if current_user.is_admin:
            owners_list = Owner.query.order_by(Owner.name).all()
            return render_template('owner_portal/subscription.html', owner=None, owners_list=owners_list)
        abort(404)
    sub = owner.subscription
    return render_template('owner_portal/subscription.html', owner=owner, subscription=sub, owners_list=None)


@owner_portal_bp.route('/api/subscription', methods=['POST'])
@login_required
def create_subscription():
    if not current_user.is_admin:
        return jsonify({'error': 'Admin only'}), 403

    data = request.get_json()
    owner_id = data.get('owner_id')
    plan = data.get('plan', 'basic')

    if plan not in Subscription.PLANS:
        return jsonify({'error': 'Invalid plan'}), 400

    owner = db.session.get(Owner, owner_id)
    if not owner:
        return jsonify({'error': 'Owner not found'}), 404

    if owner.subscription:
        # Update existing
        sub = owner.subscription
        sub.plan = plan
        sub.max_units = Subscription.PLANS[plan]['max_units']
        sub.price_monthly = Subscription.PLANS[plan]['price']
        sub.status = 'active'
    else:
        sub = Subscription(
            owner_id=owner_id,
            plan=plan,
            max_units=Subscription.PLANS[plan]['max_units'],
            price_monthly=Subscription.PLANS[plan]['price'],
            start_date=date.today(),
        )
        db.session.add(sub)

    db.session.flush()

    # Generate first invoice
    _generate_subscription_invoice(sub)
    db.session.commit()

    return jsonify({'ok': True, 'plan': plan})


@owner_portal_bp.route('/api/subscription/<int:sub_id>/cancel', methods=['POST'])
@login_required
def cancel_subscription(sub_id):
    if not current_user.is_admin:
        return jsonify({'error': 'Admin only'}), 403
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({'error': 'Not found'}), 404
    sub.status = 'cancelled'
    sub.auto_renew = False
    db.session.commit()
    return jsonify({'ok': True})


def _generate_subscription_invoice(sub):
    today = date.today()
    period_end = today + relativedelta(months=1) - timedelta(days=1)

    # Check if invoice already exists for this period
    existing = SubscriptionInvoice.query.filter_by(
        subscription_id=sub.id, period_start=today
    ).first()
    if existing:
        return

    inv_number = f"SUB-{today.strftime('%Y%m')}-{sub.owner_id:04d}"
    inv = SubscriptionInvoice(
        subscription_id=sub.id,
        amount=sub.price_monthly,
        period_start=today,
        period_end=period_end,
        invoice_number=inv_number,
    )
    db.session.add(inv)


# ── Owner Account Creation (admin creates owner login) ────────────────
@owner_portal_bp.route('/api/create-owner-account', methods=['POST'])
@login_required
def create_owner_account():
    if not current_user.is_admin:
        return jsonify({'error': 'Admin only'}), 403

    data = request.get_json()
    owner_id = data.get('owner_id')
    username = data.get('username', '').strip()
    password = data.get('password', '')
    email = data.get('email', '').strip()

    if not all([owner_id, username, password, email]):
        return jsonify({'error': 'All fields required'}), 400

    owner = db.session.get(Owner, owner_id)
    if not owner:
        return jsonify({'error': 'Owner not found'}), 404

    if owner.owner_user:
        return jsonify({'error': 'Owner already has an account'}), 400

    from app.models import User
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username taken'}), 400

    user = User(username=username, email=email, role='owner')
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    link = OwnerUser(owner_id=owner.id, user_id=user.id)
    db.session.add(link)
    db.session.commit()

    return jsonify({'ok': True, 'user_id': user.id})

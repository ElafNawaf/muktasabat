from flask import Blueprint, render_template, jsonify
from flask_login import login_required
from sqlalchemy import func
from app import db
from app.models import Owner, Building, Unit, Contract, Payment, PaymentSplit, Expense
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
@login_required
def dashboard():
    today = date.today()

    total_owners = Owner.query.count()
    total_buildings = Building.query.count()
    total_units = Unit.query.count()
    occupied_units = Unit.query.filter_by(is_available=False).count()
    active_contracts = Contract.query.filter_by(status='active').count()

    # Overdue payments
    overdue_payments = Payment.query.filter(
        Payment.status == 'pending',
        Payment.due_date < today,
    ).count()
    overdue_amount = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == 'pending', Payment.due_date < today,
    ).scalar()

    # Collection rate
    past_due = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.due_date <= today
    ).scalar()
    past_paid = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == 'paid', Payment.due_date <= today
    ).scalar()
    collection_rate = round(float(past_paid) / float(past_due) * 100, 1) if float(past_due) > 0 else 100

    # Monthly potential rent
    active = Contract.query.filter_by(status='active').all()
    monthly_potential = sum(c.rent_amount for c in active)

    # Total collected all time
    total_collected = db.session.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == 'paid'
    ).scalar()

    # Company fee income
    mgmt_income = db.session.query(func.coalesce(func.sum(PaymentSplit.amount), 0)).filter(
        PaymentSplit.split_type == 'management_fee'
    ).scalar()

    # Contracts expiring in 30 days
    expiring_30 = Contract.query.filter(
        Contract.status == 'active',
        Contract.end_date <= today + timedelta(days=30),
        Contract.end_date >= today,
    ).count()

    # Recent contracts
    recent_contracts = (
        Contract.query
        .order_by(Contract.created_at.desc())
        .limit(5)
        .all()
    )

    # Upcoming payments
    upcoming_payments = (
        Payment.query
        .filter(Payment.status == 'pending', Payment.due_date >= today)
        .order_by(Payment.due_date.asc())
        .limit(10)
        .all()
    )

    return render_template(
        'dashboard.html',
        total_owners=total_owners,
        total_buildings=total_buildings,
        total_units=total_units,
        occupied_units=occupied_units,
        active_contracts=active_contracts,
        overdue_payments=overdue_payments,
        overdue_amount=round(float(overdue_amount), 2),
        collection_rate=collection_rate,
        monthly_potential=round(monthly_potential, 2),
        total_collected=round(float(total_collected), 2),
        mgmt_income=round(float(mgmt_income), 2),
        expiring_30=expiring_30,
        recent_contracts=recent_contracts,
        upcoming_payments=upcoming_payments,
    )


@main_bp.route('/properties')
@login_required
def drilldown():
    return render_template('drilldown.html')


@main_bp.route('/health')
def health():
    try:
        db.session.execute(db.text('SELECT 1'))
        return {'status': 'ok'}
    except Exception as e:
        return {'status': 'error', 'detail': str(e)}, 500

from flask import Blueprint, render_template
from flask_login import login_required
from app import db
from app.models import Owner, Building, Unit, Contract, Payment
from datetime import date

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
@login_required
def dashboard():
    total_owners = Owner.query.count()
    total_buildings = Building.query.count()
    total_units = Unit.query.count()
    occupied_units = Unit.query.filter_by(is_available=False).count()
    active_contracts = Contract.query.filter_by(status='active').count()

    # Overdue payments
    overdue_payments = Payment.query.filter(
        Payment.status == 'pending',
        Payment.due_date < date.today(),
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
        .filter(Payment.status == 'pending', Payment.due_date >= date.today())
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
        recent_contracts=recent_contracts,
        upcoming_payments=upcoming_payments,
    )


@main_bp.route('/health')
def health():
    try:
        db.session.execute(db.text('SELECT 1'))
        return {'status': 'ok'}
    except Exception as e:
        return {'status': 'error', 'detail': str(e)}, 500

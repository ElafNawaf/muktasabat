from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Contract, Unit, Tenant, Payment

contracts_bp = Blueprint('contracts', __name__)


@contracts_bp.route('/')
@login_required
def index():
    contracts = Contract.query.order_by(Contract.created_at.desc()).all()
    return render_template('contracts/index.html', contracts=contracts)


@contracts_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'POST':
        unit_id = int(request.form['unit_id'])
        tenant_id = int(request.form['tenant_id'])
        start_date = date.fromisoformat(request.form['start_date'])
        end_date = date.fromisoformat(request.form['end_date'])
        rent_amount = float(request.form['rent_amount'])
        payment_cycle = int(request.form['payment_cycle'])

        contract = Contract(
            unit_id=unit_id,
            tenant_id=tenant_id,
            contract_number=request.form['contract_number'],
            start_date=start_date,
            end_date=end_date,
            rent_amount=rent_amount,
            payment_cycle=payment_cycle,
            notes=request.form.get('notes'),
        )
        db.session.add(contract)

        # Mark unit as occupied
        unit = db.session.get(Unit, unit_id)
        if unit:
            unit.is_available = False

        db.session.flush()

        # Generate payment schedule
        _generate_payments(contract)

        db.session.commit()
        flash(_('Contract created successfully'), 'success')
        return redirect(url_for('contracts.index'))

    units = Unit.query.filter_by(is_available=True).order_by(Unit.number).all()
    tenants = Tenant.query.order_by(Tenant.name).all()
    return render_template('contracts/form.html', contract=None, units=units, tenants=tenants)


@contracts_bp.route('/<int:contract_id>')
@login_required
def detail(contract_id):
    contract = db.session.get(Contract, contract_id) or _abort(404)
    return render_template('contracts/detail.html', contract=contract)


@contracts_bp.route('/<int:contract_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(contract_id):
    contract = db.session.get(Contract, contract_id) or _abort(404)
    if request.method == 'POST':
        contract.contract_number = request.form['contract_number']
        contract.start_date = date.fromisoformat(request.form['start_date'])
        contract.end_date = date.fromisoformat(request.form['end_date'])
        contract.rent_amount = float(request.form['rent_amount'])
        contract.payment_cycle = int(request.form['payment_cycle'])
        contract.status = request.form.get('status', 'active')
        contract.notes = request.form.get('notes')
        db.session.commit()
        flash(_('Contract updated successfully'), 'success')
        return redirect(url_for('contracts.detail', contract_id=contract.id))
    units = Unit.query.order_by(Unit.number).all()
    tenants = Tenant.query.order_by(Tenant.name).all()
    return render_template('contracts/form.html', contract=contract, units=units, tenants=tenants)


@contracts_bp.route('/<int:contract_id>/terminate', methods=['POST'])
@login_required
def terminate(contract_id):
    contract = db.session.get(Contract, contract_id) or _abort(404)
    contract.status = 'terminated'
    unit = db.session.get(Unit, contract.unit_id)
    if unit:
        unit.is_available = True
    db.session.commit()
    flash(_('Contract terminated'), 'warning')
    return redirect(url_for('contracts.detail', contract_id=contract.id))


def _generate_payments(contract):
    """Auto-generate payment installments based on payment_cycle."""
    cycle_months = contract.payment_cycle
    current_date = contract.start_date
    installment_amount = contract.rent_amount * cycle_months

    while current_date < contract.end_date:
        payment = Payment(
            contract_id=contract.id,
            amount=installment_amount,
            due_date=current_date,
            status='pending',
        )
        db.session.add(payment)
        current_date += relativedelta(months=cycle_months)


def _abort(code):
    from flask import abort
    abort(code)

from datetime import date
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Payment, PaymentSplit

payments_bp = Blueprint('payments', __name__)


@payments_bp.route('/')
@login_required
def index():
    status_filter = request.args.get('status', 'all')
    query = Payment.query
    if status_filter == 'pending':
        query = query.filter_by(status='pending')
    elif status_filter == 'paid':
        query = query.filter_by(status='paid')
    elif status_filter == 'overdue':
        query = query.filter(Payment.status == 'pending', Payment.due_date < date.today())
    payments = query.order_by(Payment.due_date.asc()).all()
    return render_template('payments/index.html', payments=payments, status_filter=status_filter)


@payments_bp.route('/<int:payment_id>/pay', methods=['POST'])
@login_required
def mark_paid(payment_id):
    payment = db.session.get(Payment, payment_id) or _abort(404)
    payment.status = 'paid'
    payment.paid_date = date.today()
    payment.payment_method = request.form.get('payment_method', 'bank_transfer')
    payment.receipt_number = request.form.get('receipt_number')
    payment.notes = request.form.get('notes')

    # Auto-split payment
    _create_payment_splits(payment)

    db.session.commit()
    flash(_('Payment recorded successfully'), 'success')
    return redirect(request.referrer or url_for('payments.index'))


@payments_bp.route('/<int:payment_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(payment_id):
    payment = db.session.get(Payment, payment_id) or _abort(404)
    if request.method == 'GET':
        # Render edit modal on the contract detail page
        return render_template('payments/edit.html', payment=payment)
    payment.amount = float(request.form['amount'])
    payment.due_date = date.fromisoformat(request.form['due_date'])
    payment.notes = request.form.get('notes')
    db.session.commit()
    flash(_('Payment updated'), 'success')
    return redirect(url_for('contracts.detail', contract_id=payment.contract_id))


def _create_payment_splits(payment):
    """Auto-split a payment into owner share, management fee, agent fee, ejar fee."""
    # Remove old splits if re-processing
    PaymentSplit.query.filter_by(payment_id=payment.id).delete()

    unit = payment.contract.unit
    amount = payment.amount
    mgmt_pct = unit.management_percentage or 0
    agent_pct = unit.agent_percentage or 0

    mgmt_fee = round(amount * mgmt_pct / 100, 2)
    agent_fee = round(amount * agent_pct / 100, 2)
    ejar = round(unit.ejar_fee or 0, 2)
    owner_share = round(amount - mgmt_fee - agent_fee - ejar, 2)

    if mgmt_fee > 0:
        db.session.add(PaymentSplit(
            payment_id=payment.id, split_type='management_fee',
            amount=mgmt_fee, description=f'{mgmt_pct}% management fee',
        ))
    if agent_fee > 0:
        db.session.add(PaymentSplit(
            payment_id=payment.id, split_type='agent_fee',
            amount=agent_fee, description=f'{agent_pct}% agent fee ({unit.agent_name or ""})',
        ))
    if ejar > 0:
        db.session.add(PaymentSplit(
            payment_id=payment.id, split_type='ejar_fee',
            amount=ejar, description='Ejar platform fee',
        ))
    db.session.add(PaymentSplit(
        payment_id=payment.id, split_type='owner_share',
        amount=owner_share, description='Net amount to owner',
    ))


def _abort(code):
    from flask import abort
    abort(code)

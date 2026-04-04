from datetime import date
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Payment

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
    db.session.commit()
    flash(_('Payment recorded successfully'), 'success')
    return redirect(request.referrer or url_for('payments.index'))


@payments_bp.route('/<int:payment_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(payment_id):
    payment = db.session.get(Payment, payment_id) or _abort(404)
    if request.method == 'POST':
        payment.amount = float(request.form['amount'])
        payment.due_date = date.fromisoformat(request.form['due_date'])
        payment.notes = request.form.get('notes')
        db.session.commit()
        flash(_('Payment updated'), 'success')
        return redirect(url_for('payments.index'))
    return render_template('payments/edit.html', payment=payment)


def _abort(code):
    from flask import abort
    abort(code)

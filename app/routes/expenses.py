"""Expense tracking CRUD."""
from datetime import date
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Expense, Owner, Building, Unit
from app.i18n_data import optional_form_str

expenses_bp = Blueprint('expenses', __name__, url_prefix='/expenses')


@expenses_bp.route('/')
@login_required
def index():
    cat = request.args.get('category')
    query = Expense.query
    if cat:
        query = query.filter_by(category=cat)
    expenses = query.order_by(Expense.expense_date.desc()).all()
    owners = Owner.query.order_by(Owner.name).all()
    buildings = Building.query.order_by(Building.name).all()
    return render_template('expenses/index.html', expenses=expenses, owners=owners, buildings=buildings, categories=Expense.CATEGORIES, today=date.today().isoformat())


@expenses_bp.route('/create', methods=['POST'])
@login_required
def create():
    e = Expense(
        owner_id=request.form.get('owner_id', type=int) or None,
        building_id=request.form.get('building_id', type=int) or None,
        unit_id=request.form.get('unit_id', type=int) or None,
        category=request.form['category'],
        description=request.form['description'],
        description_en=optional_form_str(request.form, 'description_en'),
        description_ar=optional_form_str(request.form, 'description_ar'),
        amount=float(request.form['amount']),
        expense_date=date.fromisoformat(request.form['expense_date']),
        paid_by=request.form.get('paid_by', 'company'),
        vendor_name=request.form.get('vendor_name'),
        receipt_number=request.form.get('receipt_number'),
        notes=request.form.get('notes'),
    )
    db.session.add(e)
    db.session.commit()
    flash(_('Expense recorded'), 'success')
    return redirect(url_for('expenses.index'))


@expenses_bp.route('/<int:expense_id>/delete', methods=['POST'])
@login_required
def delete(expense_id):
    e = db.session.get(Expense, expense_id) or abort(404)
    db.session.delete(e)
    db.session.commit()
    flash(_('Expense deleted'), 'success')
    return redirect(url_for('expenses.index'))

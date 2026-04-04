from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from flask_babel import _
from app import db
from app.models import Owner

owners_bp = Blueprint('owners', __name__)


@owners_bp.route('/')
@login_required
def index():
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('owners/index.html', owners=owners)


@owners_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'POST':
        owner = Owner(
            name=request.form['name'],
            phone=request.form.get('phone'),
            email=request.form.get('email'),
            national_id=request.form.get('national_id'),
            bank_name=request.form.get('bank_name'),
            iban=request.form.get('iban'),
            notes=request.form.get('notes'),
        )
        db.session.add(owner)
        db.session.commit()
        flash(_('Owner created successfully'), 'success')
        return redirect(url_for('owners.index'))
    return render_template('owners/form.html', owner=None)


@owners_bp.route('/<int:owner_id>')
@login_required
def detail(owner_id):
    owner = db.session.get(Owner, owner_id) or abort(404)
    return render_template('owners/detail.html', owner=owner)


@owners_bp.route('/<int:owner_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(owner_id):
    owner = db.session.get(Owner, owner_id) or abort(404)
    if request.method == 'POST':
        owner.name = request.form['name']
        owner.phone = request.form.get('phone')
        owner.email = request.form.get('email')
        owner.national_id = request.form.get('national_id')
        owner.bank_name = request.form.get('bank_name')
        owner.iban = request.form.get('iban')
        owner.notes = request.form.get('notes')
        db.session.commit()
        flash(_('Owner updated successfully'), 'success')
        return redirect(url_for('owners.detail', owner_id=owner.id))
    return render_template('owners/form.html', owner=owner)


@owners_bp.route('/<int:owner_id>/delete', methods=['POST'])
@login_required
def delete(owner_id):
    owner = db.session.get(Owner, owner_id) or abort(404)
    db.session.delete(owner)
    db.session.commit()
    flash(_('Owner deleted'), 'success')
    return redirect(url_for('owners.index'))


def abort(code):
    from flask import abort as flask_abort
    flask_abort(code)

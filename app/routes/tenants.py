from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Tenant
from app.i18n_data import optional_form_str

tenants_bp = Blueprint('tenants', __name__)


@tenants_bp.route('/')
@login_required
def index():
    tenants = Tenant.query.order_by(Tenant.name).all()
    return render_template('tenants/index.html', tenants=tenants)


@tenants_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'GET':
        return redirect(url_for('tenants.index', new=1))

    if request.method == 'POST':
        tenant = Tenant(
            name=request.form['name'],
            name_en=optional_form_str(request.form, 'name_en'),
            name_ar=optional_form_str(request.form, 'name_ar'),
            phone=request.form['phone'],
            national_id=request.form['national_id'],
            email=request.form.get('email'),
            notes=request.form.get('notes'),
            notes_en=optional_form_str(request.form, 'notes_en'),
            notes_ar=optional_form_str(request.form, 'notes_ar'),
        )
        db.session.add(tenant)
        db.session.commit()
        flash(_('Tenant created successfully'), 'success')
        return redirect(url_for('tenants.index'))

    abort(405)


@tenants_bp.route('/<int:tenant_id>')
@login_required
def detail(tenant_id):
    tenant = db.session.get(Tenant, tenant_id) or _abort(404)
    return render_template('tenants/detail.html', tenant=tenant)


@tenants_bp.route('/<int:tenant_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(tenant_id):
    tenant = db.session.get(Tenant, tenant_id) or _abort(404)
    if request.method == 'GET':
        return redirect(url_for('tenants.detail', tenant_id=tenant.id, edit=1))
    tenant.name = request.form['name']
    tenant.name_en = optional_form_str(request.form, 'name_en')
    tenant.name_ar = optional_form_str(request.form, 'name_ar')
    tenant.phone = request.form['phone']
    tenant.national_id = request.form['national_id']
    tenant.email = request.form.get('email')
    tenant.notes = request.form.get('notes')
    tenant.notes_en = optional_form_str(request.form, 'notes_en')
    tenant.notes_ar = optional_form_str(request.form, 'notes_ar')
    db.session.commit()
    flash(_('Tenant updated successfully'), 'success')
    return redirect(url_for('tenants.detail', tenant_id=tenant.id))


@tenants_bp.route('/<int:tenant_id>/delete', methods=['POST'])
@login_required
def delete(tenant_id):
    tenant = db.session.get(Tenant, tenant_id) or _abort(404)
    db.session.delete(tenant)
    db.session.commit()
    flash(_('Tenant deleted'), 'success')
    return redirect(url_for('tenants.index'))


def _abort(code):
    from flask import abort
    abort(code)

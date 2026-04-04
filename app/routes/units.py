from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Unit, Building

units_bp = Blueprint('units', __name__)


@units_bp.route('/')
@login_required
def index():
    units = Unit.query.order_by(Unit.building_id, Unit.number).all()
    return render_template('units/index.html', units=units)


@units_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'POST':
        unit = Unit(
            building_id=request.form['building_id'],
            name=request.form['name'],
            number=request.form['number'],
            unit_type=request.form.get('unit_type'),
            area_sqm=request.form.get('area_sqm', type=float),
            rent_amount=request.form.get('rent_amount', 0, type=float),
            management_percentage=request.form.get('management_percentage', 0, type=float),
            agent_name=request.form.get('agent_name'),
            agent_percentage=request.form.get('agent_percentage', 0, type=float),
            electric_invoice=request.form.get('electric_invoice'),
            water_invoice=request.form.get('water_invoice'),
            ejar_fee=request.form.get('ejar_fee', 0, type=float),
            notes=request.form.get('notes'),
        )
        db.session.add(unit)
        db.session.commit()
        flash(_('Unit created successfully'), 'success')
        return redirect(url_for('units.index'))
    buildings = Building.query.order_by(Building.name).all()
    return render_template('units/form.html', unit=None, buildings=buildings)


@units_bp.route('/<int:unit_id>')
@login_required
def detail(unit_id):
    unit = db.session.get(Unit, unit_id) or _abort(404)
    return render_template('units/detail.html', unit=unit)


@units_bp.route('/<int:unit_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(unit_id):
    unit = db.session.get(Unit, unit_id) or _abort(404)
    if request.method == 'POST':
        unit.building_id = request.form['building_id']
        unit.name = request.form['name']
        unit.number = request.form['number']
        unit.unit_type = request.form.get('unit_type')
        unit.area_sqm = request.form.get('area_sqm', type=float)
        unit.rent_amount = request.form.get('rent_amount', 0, type=float)
        unit.management_percentage = request.form.get('management_percentage', 0, type=float)
        unit.agent_name = request.form.get('agent_name')
        unit.agent_percentage = request.form.get('agent_percentage', 0, type=float)
        unit.electric_invoice = request.form.get('electric_invoice')
        unit.water_invoice = request.form.get('water_invoice')
        unit.ejar_fee = request.form.get('ejar_fee', 0, type=float)
        unit.notes = request.form.get('notes')
        db.session.commit()
        flash(_('Unit updated successfully'), 'success')
        return redirect(url_for('units.detail', unit_id=unit.id))
    buildings = Building.query.order_by(Building.name).all()
    return render_template('units/form.html', unit=unit, buildings=buildings)


@units_bp.route('/<int:unit_id>/delete', methods=['POST'])
@login_required
def delete(unit_id):
    unit = db.session.get(Unit, unit_id) or _abort(404)
    db.session.delete(unit)
    db.session.commit()
    flash(_('Unit deleted'), 'success')
    return redirect(url_for('units.index'))


def _abort(code):
    from flask import abort
    abort(code)

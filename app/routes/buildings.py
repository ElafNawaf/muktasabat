from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Building, Owner
from app.i18n_data import optional_form_str

buildings_bp = Blueprint('buildings', __name__)


@buildings_bp.route('/')
@login_required
def index():
    buildings = Building.query.order_by(Building.name).all()
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('buildings/index.html', buildings=buildings, owners=owners)


@buildings_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'GET':
        args = {'new': 1}
        if request.args.get('owner_id'):
            args['owner_id'] = request.args.get('owner_id')
        return redirect(url_for('buildings.index', **args))

    if request.method == 'POST':
        building = Building(
            owner_id=request.form['owner_id'],
            name=request.form['name'],
            name_en=optional_form_str(request.form, 'name_en'),
            name_ar=optional_form_str(request.form, 'name_ar'),
            address=request.form.get('address'),
            address_en=optional_form_str(request.form, 'address_en'),
            address_ar=optional_form_str(request.form, 'address_ar'),
            city=request.form.get('city'),
            city_en=optional_form_str(request.form, 'city_en'),
            city_ar=optional_form_str(request.form, 'city_ar'),
            district=request.form.get('district'),
            district_en=optional_form_str(request.form, 'district_en'),
            district_ar=optional_form_str(request.form, 'district_ar'),
            notes=request.form.get('notes'),
            notes_en=optional_form_str(request.form, 'notes_en'),
            notes_ar=optional_form_str(request.form, 'notes_ar'),
        )
        db.session.add(building)
        db.session.commit()
        flash(_('Building created successfully'), 'success')
        return redirect(url_for('buildings.index'))

    abort(405)


@buildings_bp.route('/<int:building_id>')
@login_required
def detail(building_id):
    building = db.session.get(Building, building_id) or _abort(404)
    return render_template('buildings/detail.html', building=building)


@buildings_bp.route('/<int:building_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(building_id):
    building = db.session.get(Building, building_id) or _abort(404)
    if request.method == 'GET':
        return redirect(url_for('buildings.detail', building_id=building.id, edit=1))
    if request.method == 'POST':
        building.owner_id = request.form['owner_id']
        building.name = request.form['name']
        building.name_en = optional_form_str(request.form, 'name_en')
        building.name_ar = optional_form_str(request.form, 'name_ar')
        building.address = request.form.get('address')
        building.address_en = optional_form_str(request.form, 'address_en')
        building.address_ar = optional_form_str(request.form, 'address_ar')
        building.city = request.form.get('city')
        building.city_en = optional_form_str(request.form, 'city_en')
        building.city_ar = optional_form_str(request.form, 'city_ar')
        building.district = request.form.get('district')
        building.district_en = optional_form_str(request.form, 'district_en')
        building.district_ar = optional_form_str(request.form, 'district_ar')
        building.notes = request.form.get('notes')
        building.notes_en = optional_form_str(request.form, 'notes_en')
        building.notes_ar = optional_form_str(request.form, 'notes_ar')
        db.session.commit()
        flash(_('Building updated successfully'), 'success')
        return redirect(url_for('buildings.detail', building_id=building.id))
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('buildings/form.html', building=building, owners=owners)


@buildings_bp.route('/<int:building_id>/delete', methods=['POST'])
@login_required
def delete(building_id):
    building = db.session.get(Building, building_id) or _abort(404)
    db.session.delete(building)
    db.session.commit()
    flash(_('Building deleted'), 'success')
    return redirect(url_for('buildings.index'))


def _abort(code):
    from flask import abort
    abort(code)

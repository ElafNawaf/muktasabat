from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required
from flask_babel import _
from app import db
from app.models import Building, Owner

buildings_bp = Blueprint('buildings', __name__)


@buildings_bp.route('/')
@login_required
def index():
    buildings = Building.query.order_by(Building.name).all()
    return render_template('buildings/index.html', buildings=buildings)


@buildings_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if request.method == 'POST':
        building = Building(
            owner_id=request.form['owner_id'],
            name=request.form['name'],
            address=request.form.get('address'),
            city=request.form.get('city'),
            district=request.form.get('district'),
            notes=request.form.get('notes'),
        )
        db.session.add(building)
        db.session.commit()
        flash(_('Building created successfully'), 'success')
        return redirect(url_for('buildings.index'))
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('buildings/form.html', building=None, owners=owners)


@buildings_bp.route('/<int:building_id>')
@login_required
def detail(building_id):
    building = db.session.get(Building, building_id) or _abort(404)
    return render_template('buildings/detail.html', building=building)


@buildings_bp.route('/<int:building_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(building_id):
    building = db.session.get(Building, building_id) or _abort(404)
    if request.method == 'POST':
        building.owner_id = request.form['owner_id']
        building.name = request.form['name']
        building.address = request.form.get('address')
        building.city = request.form.get('city')
        building.district = request.form.get('district')
        building.notes = request.form.get('notes')
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

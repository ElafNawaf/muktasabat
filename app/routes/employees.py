from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from flask_babel import _
from app import db
from app.models import Employee, Owner, User

employees_bp = Blueprint('employees', __name__)


@employees_bp.route('/')
@login_required
def index():
    employees = Employee.query.order_by(Employee.name).all()
    return render_template('employees/index.html', employees=employees)


@employees_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create():
    if not current_user.is_admin:
        flash(_('Access denied'), 'danger')
        return redirect(url_for('employees.index'))

    if request.method == 'POST':
        employee = Employee(
            user_id=int(request.form['user_id']),
            name=request.form['name'],
            phone=request.form.get('phone'),
        )
        # Assign owners
        owner_ids = request.form.getlist('owner_ids')
        for oid in owner_ids:
            owner = db.session.get(Owner, int(oid))
            if owner:
                employee.owners.append(owner)

        db.session.add(employee)
        db.session.commit()
        flash(_('Employee created successfully'), 'success')
        return redirect(url_for('employees.index'))

    users = User.query.filter(~User.id.in_(
        db.session.query(Employee.user_id)
    )).order_by(User.username).all()
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('employees/form.html', employee=None, users=users, owners=owners)


@employees_bp.route('/<int:employee_id>')
@login_required
def detail(employee_id):
    employee = db.session.get(Employee, employee_id) or _abort(404)
    return render_template('employees/detail.html', employee=employee)


@employees_bp.route('/<int:employee_id>/edit', methods=['GET', 'POST'])
@login_required
def edit(employee_id):
    if not current_user.is_admin:
        flash(_('Access denied'), 'danger')
        return redirect(url_for('employees.index'))

    employee = db.session.get(Employee, employee_id) or _abort(404)
    if request.method == 'POST':
        employee.name = request.form['name']
        employee.phone = request.form.get('phone')
        # Update assigned owners
        employee.owners.clear()
        owner_ids = request.form.getlist('owner_ids')
        for oid in owner_ids:
            owner = db.session.get(Owner, int(oid))
            if owner:
                employee.owners.append(owner)
        db.session.commit()
        flash(_('Employee updated successfully'), 'success')
        return redirect(url_for('employees.detail', employee_id=employee.id))

    users = User.query.order_by(User.username).all()
    owners = Owner.query.order_by(Owner.name).all()
    return render_template('employees/form.html', employee=employee, users=users, owners=owners)


def _abort(code):
    from flask import abort
    abort(code)

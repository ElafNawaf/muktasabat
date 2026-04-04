from flask import Blueprint, render_template, redirect, url_for, flash, request, session
from flask_login import login_user, logout_user, login_required, current_user
from flask_babel import _
from app import db, limiter, login_manager
from app.models import User, AuditLog

auth_bp = Blueprint('auth', __name__)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@auth_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit('10/minute')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password) and user.is_active:
            login_user(user, remember=True)
            session.permanent = True
            log = AuditLog(
                user_id=user.id, username=user.username,
                action='login', entity_type='user',
                ip_address=request.remote_addr,
            )
            db.session.add(log)
            db.session.commit()
            next_page = request.args.get('next')
            return redirect(next_page or url_for('main.dashboard'))

        flash(_('Invalid username or password'), 'danger')

    return render_template('login.html')


@auth_bp.route('/register', methods=['GET', 'POST'])
@limiter.limit('5/minute')
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')

        if User.query.filter_by(username=username).first():
            flash(_('Username already exists'), 'danger')
        elif User.query.filter_by(email=email).first():
            flash(_('Email already exists'), 'danger')
        elif len(password) < 6:
            flash(_('Password must be at least 6 characters'), 'danger')
        else:
            user = User(username=username, email=email, role='viewer')
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            flash(_('Registration successful. Please log in.'), 'success')
            return redirect(url_for('auth.login'))

    return render_template('register.html')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))


@auth_bp.route('/set-language/<lang>')
def set_language(lang):
    if lang in ('ar', 'en'):
        session['lang'] = lang
    return redirect(request.referrer or url_for('main.dashboard'))


# ---------- Admin: User Management ----------
@auth_bp.route('/admin/users')
@login_required
def admin_users():
    if not current_user.is_admin:
        flash(_('Access denied'), 'danger')
        return redirect(url_for('main.dashboard'))
    users = User.query.order_by(User.created_at.desc()).all()
    return render_template('admin_users.html', users=users)


@auth_bp.route('/api/users/<int:user_id>/role', methods=['PUT'])
@login_required
def change_role(user_id):
    if not current_user.is_admin:
        return {'error': 'Forbidden'}, 403
    user = db.session.get(User, user_id)
    if not user:
        return {'error': 'Not found'}, 404
    data = request.get_json()
    new_role = data.get('role')
    if new_role not in ('admin', 'manager', 'viewer'):
        return {'error': 'Invalid role'}, 400
    user.role = new_role
    db.session.commit()
    return {'ok': True}


@auth_bp.route('/api/users/<int:user_id>/toggle-active', methods=['PUT'])
@login_required
def toggle_active(user_id):
    if not current_user.is_admin:
        return {'error': 'Forbidden'}, 403
    user = db.session.get(User, user_id)
    if not user:
        return {'error': 'Not found'}, 404
    user.is_active_user = not user.is_active_user
    db.session.commit()
    return {'ok': True, 'is_active': user.is_active_user}

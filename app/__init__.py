import os
import logging
from logging.handlers import RotatingFileHandler

from flask import Flask, request, session
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_babel import Babel
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
babel = Babel()
talisman = Talisman()
limiter = Limiter(key_func=get_remote_address)
csrf = CSRFProtect()


def get_locale():
    if 'lang' in session:
        return session['lang']
    return request.accept_languages.best_match(['ar', 'en']) or 'ar'


def get_timezone():
    return 'Asia/Riyadh'


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates'),
        static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'),
    )

    from app.config import config_by_name
    app.config.from_object(config_by_name.get(config_name, config_by_name['development']))

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'warning'

    babel.init_app(app, locale_selector=get_locale, timezone_selector=get_timezone)

    csp = {
        'default-src': "'self'",
        'script-src': ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        'style-src': ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
        'font-src': ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        'img-src': ["'self'", "data:"],
        'connect-src': "'self'",
    }
    force_https = app.config.get('TALISMAN_FORCE_HTTPS', False)
    talisman.init_app(app, content_security_policy=csp, force_https=force_https)

    if not app.config.get('RATELIMIT_ENABLED') == False:
        limiter.init_app(app)

    csrf.init_app(app)

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.main import main_bp
    from app.routes.owners import owners_bp
    from app.routes.buildings import buildings_bp
    from app.routes.units import units_bp
    from app.routes.tenants import tenants_bp
    from app.routes.contracts import contracts_bp
    from app.routes.payments import payments_bp
    from app.routes.employees import employees_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(owners_bp, url_prefix='/owners')
    app.register_blueprint(buildings_bp, url_prefix='/buildings')
    app.register_blueprint(units_bp, url_prefix='/units')
    app.register_blueprint(tenants_bp, url_prefix='/tenants')
    app.register_blueprint(contracts_bp, url_prefix='/contracts')
    app.register_blueprint(payments_bp, url_prefix='/payments')
    app.register_blueprint(employees_bp, url_prefix='/employees')

    # Context processor for templates
    @app.context_processor
    def inject_locale():
        return {
            'current_locale': get_locale(),
            'is_rtl': get_locale() == 'ar',
            'languages': app.config['LANGUAGES'],
        }

    # Setup logging
    _setup_logging(app)

    return app


def _setup_logging(app):
    log_level = getattr(logging, app.config.get('LOG_LEVEL', 'INFO'))
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs')
    os.makedirs(log_dir, exist_ok=True)

    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'muktasbat.log'),
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s %(name)s: %(message)s'
    ))
    app.logger.addHandler(file_handler)
    app.logger.setLevel(log_level)

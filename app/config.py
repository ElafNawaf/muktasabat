import os
from datetime import timedelta


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.lower() in ('1', 'true', 'yes', 'on')


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///muktasbat.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PERMANENT_SESSION_LIFETIME = timedelta(hours=8)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # Babel / i18n
    BABEL_DEFAULT_LOCALE = os.environ.get('BABEL_DEFAULT_LOCALE', 'ar')
    BABEL_DEFAULT_TIMEZONE = os.environ.get('BABEL_DEFAULT_TIMEZONE', 'Asia/Riyadh')
    LANGUAGES = {'ar': 'العربية', 'en': 'English'}

    # Rate limiting
    RATELIMIT_DEFAULT = os.environ.get('RATELIMIT_DEFAULT', '200/minute')
    RATELIMIT_STORAGE_URI = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')

    # Logging
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')


class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = 'DEBUG'
    USE_HTTPS = _env_bool('USE_HTTPS', False)


class ProductionConfig(Config):
    DEBUG = False
    # Set USE_HTTPS=false when the app is served over HTTP only (e.g. local Docker / LAN).
    _https = _env_bool('USE_HTTPS', True)
    USE_HTTPS = _https
    SESSION_COOKIE_SECURE = _https
    TALISMAN_FORCE_HTTPS = _https
    # Flask-WTF defaults WTF_CSRF_SSL_STRICT=True; disable for plain HTTP (avoids referrer issues).
    WTF_CSRF_SSL_STRICT = _https
    # Omit SameSite on HTTP so some mobile/LAN clients send the session cookie more reliably.
    SESSION_COOKIE_SAMESITE = 'Lax' if _https else None


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite://'
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False


config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
}

"""Seed the database with an admin user and optional mock data for POC demos."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models import User

app = create_app()

with app.app_context():
    db.create_all()

    # Create admin user if not exists
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(username='admin', email='admin@muktasbat.com', role='admin')
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('Admin user created: admin / admin123')
    else:
        print('Admin user already exists.')

    # Mock data — controlled by SEED_MOCK_DATA env var
    seed_mock = os.environ.get('SEED_MOCK_DATA', 'false').lower() in ('1', 'true', 'yes', 'on')
    if seed_mock:
        from scripts.mock_data import seed_mock_data
        seed_mock_data(db)
    else:
        print('Mock data skipped (set SEED_MOCK_DATA=true to enable).')

    print('Database seeded successfully.')

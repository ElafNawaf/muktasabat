"""Add bilingual _en/_ar columns for names, addresses, notes, descriptions.

Revision ID: b8f2a1c0d4e3
Revises: 70348a4131e3
Create Date: 2026-04-04

"""
from alembic import op
import sqlalchemy as sa


revision = 'b8f2a1c0d4e3'
down_revision = '70348a4131e3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employees', sa.Column('name_en', sa.String(length=120), nullable=True))
    op.add_column('employees', sa.Column('name_ar', sa.String(length=120), nullable=True))

    op.add_column('owners', sa.Column('name_en', sa.String(length=150), nullable=True))
    op.add_column('owners', sa.Column('name_ar', sa.String(length=150), nullable=True))
    op.add_column('owners', sa.Column('notes_en', sa.Text(), nullable=True))
    op.add_column('owners', sa.Column('notes_ar', sa.Text(), nullable=True))

    op.add_column('tenants', sa.Column('name_en', sa.String(length=150), nullable=True))
    op.add_column('tenants', sa.Column('name_ar', sa.String(length=150), nullable=True))
    op.add_column('tenants', sa.Column('notes_en', sa.Text(), nullable=True))
    op.add_column('tenants', sa.Column('notes_ar', sa.Text(), nullable=True))

    op.add_column('buildings', sa.Column('name_en', sa.String(length=150), nullable=True))
    op.add_column('buildings', sa.Column('name_ar', sa.String(length=150), nullable=True))
    op.add_column('buildings', sa.Column('address_en', sa.String(length=300), nullable=True))
    op.add_column('buildings', sa.Column('address_ar', sa.String(length=300), nullable=True))
    op.add_column('buildings', sa.Column('city_en', sa.String(length=100), nullable=True))
    op.add_column('buildings', sa.Column('city_ar', sa.String(length=100), nullable=True))
    op.add_column('buildings', sa.Column('district_en', sa.String(length=100), nullable=True))
    op.add_column('buildings', sa.Column('district_ar', sa.String(length=100), nullable=True))
    op.add_column('buildings', sa.Column('notes_en', sa.Text(), nullable=True))
    op.add_column('buildings', sa.Column('notes_ar', sa.Text(), nullable=True))

    op.add_column('units', sa.Column('name_en', sa.String(length=100), nullable=True))
    op.add_column('units', sa.Column('name_ar', sa.String(length=100), nullable=True))
    op.add_column('units', sa.Column('notes_en', sa.Text(), nullable=True))
    op.add_column('units', sa.Column('notes_ar', sa.Text(), nullable=True))

    op.add_column('expenses', sa.Column('description_en', sa.String(length=300), nullable=True))
    op.add_column('expenses', sa.Column('description_ar', sa.String(length=300), nullable=True))


def downgrade():
    op.drop_column('expenses', 'description_ar')
    op.drop_column('expenses', 'description_en')

    op.drop_column('units', 'notes_ar')
    op.drop_column('units', 'notes_en')
    op.drop_column('units', 'name_ar')
    op.drop_column('units', 'name_en')

    op.drop_column('buildings', 'notes_ar')
    op.drop_column('buildings', 'notes_en')
    op.drop_column('buildings', 'district_ar')
    op.drop_column('buildings', 'district_en')
    op.drop_column('buildings', 'city_ar')
    op.drop_column('buildings', 'city_en')
    op.drop_column('buildings', 'address_ar')
    op.drop_column('buildings', 'address_en')
    op.drop_column('buildings', 'name_ar')
    op.drop_column('buildings', 'name_en')

    op.drop_column('tenants', 'notes_ar')
    op.drop_column('tenants', 'notes_en')
    op.drop_column('tenants', 'name_ar')
    op.drop_column('tenants', 'name_en')

    op.drop_column('owners', 'notes_ar')
    op.drop_column('owners', 'notes_en')
    op.drop_column('owners', 'name_ar')
    op.drop_column('owners', 'name_en')

    op.drop_column('employees', 'name_ar')
    op.drop_column('employees', 'name_en')

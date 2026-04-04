import uuid
from datetime import datetime, date
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app import db


# ---------- Association: Employee <-> Owner (many-to-many) ----------
employee_owners = db.Table(
    'employee_owners',
    db.Column('employee_id', db.Integer, db.ForeignKey('employees.id'), primary_key=True),
    db.Column('owner_id', db.Integer, db.ForeignKey('owners.id'), primary_key=True),
)


# ---------- User ----------
class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='viewer')  # admin, manager, viewer
    is_active_user = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    employee = db.relationship('Employee', back_populates='user', uselist=False)
    audit_logs = db.relationship('AuditLog', back_populates='user', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == 'admin'

    @property
    def is_owner_user(self):
        return self.role == 'owner'

    @property
    def linked_owner(self):
        if hasattr(self, 'owner_link') and self.owner_link:
            return self.owner_link.owner
        return None

    @property
    def is_active(self):
        return self.is_active_user


# ---------- Employee ----------
class Employee(db.Model):
    __tablename__ = 'employees'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    name_en = db.Column(db.String(120))
    name_ar = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', back_populates='employee')
    owners = db.relationship('Owner', secondary=employee_owners, back_populates='employees')


# ---------- Owner ----------
class Owner(db.Model):
    __tablename__ = 'owners'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    name_en = db.Column(db.String(150))
    name_ar = db.Column(db.String(150))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    national_id = db.Column(db.String(20))
    bank_name = db.Column(db.String(100))
    iban = db.Column(db.String(34))
    notes = db.Column(db.Text)
    notes_en = db.Column(db.Text)
    notes_ar = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    buildings = db.relationship('Building', back_populates='owner', cascade='all, delete-orphan')
    employees = db.relationship('Employee', secondary=employee_owners, back_populates='owners')


# ---------- Building ----------
class Building(db.Model):
    __tablename__ = 'buildings'

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('owners.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    name_en = db.Column(db.String(150))
    name_ar = db.Column(db.String(150))
    address = db.Column(db.String(300))
    address_en = db.Column(db.String(300))
    address_ar = db.Column(db.String(300))
    city = db.Column(db.String(100))
    city_en = db.Column(db.String(100))
    city_ar = db.Column(db.String(100))
    district = db.Column(db.String(100))
    district_en = db.Column(db.String(100))
    district_ar = db.Column(db.String(100))
    notes = db.Column(db.Text)
    notes_en = db.Column(db.Text)
    notes_ar = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('Owner', back_populates='buildings')
    units = db.relationship('Unit', back_populates='building', cascade='all, delete-orphan')


# ---------- Unit ----------
class Unit(db.Model):
    __tablename__ = 'units'

    id = db.Column(db.Integer, primary_key=True)
    building_id = db.Column(db.Integer, db.ForeignKey('buildings.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    name_en = db.Column(db.String(100))
    name_ar = db.Column(db.String(100))
    number = db.Column(db.String(50), nullable=False)
    unit_type = db.Column(db.String(50))  # apartment, shop, office, warehouse, etc.
    area_sqm = db.Column(db.Float)
    rent_amount = db.Column(db.Float, default=0)

    # Property management fees
    management_percentage = db.Column(db.Float, default=0)  # % of rent for property management company
    agent_name = db.Column(db.String(150))
    agent_percentage = db.Column(db.Float, default=0)  # % of rent for the agent (if any)

    # Utility invoices
    electric_invoice = db.Column(db.String(50))   # electricity meter/account number
    water_invoice = db.Column(db.String(50))      # water meter/account number

    # Ejar platform fees
    ejar_fee = db.Column(db.Float, default=0)  # fee to create contract on Ejar platform

    is_available = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text)
    notes_en = db.Column(db.Text)
    notes_ar = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    building = db.relationship('Building', back_populates='units')
    contracts = db.relationship('Contract', back_populates='unit', cascade='all, delete-orphan')


# ---------- Tenant ----------
class Tenant(db.Model):
    __tablename__ = 'tenants'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    name_en = db.Column(db.String(150))
    name_ar = db.Column(db.String(150))
    phone = db.Column(db.String(20), nullable=False)
    national_id = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(120))
    notes = db.Column(db.Text)
    notes_en = db.Column(db.Text)
    notes_ar = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    contracts = db.relationship('Contract', back_populates='tenant')


# ---------- Contract ----------
class Contract(db.Model):
    __tablename__ = 'contracts'

    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    contract_number = db.Column(db.String(50), unique=True, nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    rent_amount = db.Column(db.Float, nullable=False)
    payment_cycle = db.Column(db.Integer, nullable=False)  # 3, 6, or 12 months
    status = db.Column(db.String(20), default='active')  # active, expired, terminated
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    unit = db.relationship('Unit', back_populates='contracts')
    tenant = db.relationship('Tenant', back_populates='contracts')
    payments = db.relationship('Payment', back_populates='contract', cascade='all, delete-orphan')

    @property
    def is_active(self):
        return self.status == 'active' and self.end_date >= date.today()

    @property
    def management_fee(self):
        """Calculate the property management fee per payment cycle."""
        pct = self.unit.management_percentage or 0
        return self.rent_amount * (pct / 100)

    @property
    def agent_fee(self):
        """Calculate the agent fee per payment cycle."""
        pct = self.unit.agent_percentage or 0
        return self.rent_amount * (pct / 100)


# ---------- Payment ----------
class Payment(db.Model):
    __tablename__ = 'payments'

    id = db.Column(db.Integer, primary_key=True)
    contract_id = db.Column(db.Integer, db.ForeignKey('contracts.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    paid_date = db.Column(db.Date)
    status = db.Column(db.String(20), default='pending')  # pending, paid, overdue
    payment_method = db.Column(db.String(50))  # bank_transfer, cash, cheque
    receipt_number = db.Column(db.String(50))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    contract = db.relationship('Contract', back_populates='payments')


# ---------- Expense ----------
class Expense(db.Model):
    """Tracks operational costs: maintenance, utilities, insurance, etc."""
    __tablename__ = 'expenses'

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('owners.id'))
    building_id = db.Column(db.Integer, db.ForeignKey('buildings.id'))
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'))
    category = db.Column(db.String(50), nullable=False)  # maintenance, utilities, insurance, legal, marketing, other
    description = db.Column(db.String(300), nullable=False)
    description_en = db.Column(db.String(300))
    description_ar = db.Column(db.String(300))
    amount = db.Column(db.Float, nullable=False)
    expense_date = db.Column(db.Date, nullable=False, default=date.today)
    paid_by = db.Column(db.String(30), default='company')  # company, owner, tenant
    receipt_number = db.Column(db.String(50))
    vendor_name = db.Column(db.String(150))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('Owner', backref=db.backref('expenses', lazy='dynamic'))
    building = db.relationship('Building', backref=db.backref('expenses', lazy='dynamic'))
    unit = db.relationship('Unit', backref=db.backref('expenses', lazy='dynamic'))

    CATEGORIES = [
        ('maintenance', 'Maintenance'),
        ('utilities', 'Utilities'),
        ('insurance', 'Insurance'),
        ('legal', 'Legal'),
        ('marketing', 'Marketing'),
        ('cleaning', 'Cleaning'),
        ('security', 'Security'),
        ('government_fees', 'Government Fees'),
        ('other', 'Other'),
    ]


# ---------- Owner-User Link (owner portal login) ----------
class OwnerUser(db.Model):
    """Links an Owner to a User account so owners can log in and see their data."""
    __tablename__ = 'owner_users'

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('owners.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)

    owner = db.relationship('Owner', backref=db.backref('owner_user', uselist=False))
    user = db.relationship('User', backref=db.backref('owner_link', uselist=False))


# ---------- Subscription ----------
class Subscription(db.Model):
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('owners.id'), nullable=False, unique=True)
    plan = db.Column(db.String(20), nullable=False, default='basic')  # basic, pro, enterprise
    max_units = db.Column(db.Integer, nullable=False, default=10)
    price_monthly = db.Column(db.Float, nullable=False, default=199)
    status = db.Column(db.String(20), default='active')  # active, expired, cancelled
    start_date = db.Column(db.Date, nullable=False, default=date.today)
    end_date = db.Column(db.Date)
    auto_renew = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('Owner', backref=db.backref('subscription', uselist=False))
    invoices = db.relationship('SubscriptionInvoice', back_populates='subscription', cascade='all, delete-orphan')

    PLANS = {
        'basic':      {'max_units': 10,  'price': 199,  'label': 'Basic'},
        'pro':        {'max_units': 50,  'price': 499,  'label': 'Pro'},
        'enterprise': {'max_units': 9999, 'price': 999, 'label': 'Enterprise'},
    }


class SubscriptionInvoice(db.Model):
    __tablename__ = 'subscription_invoices'

    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey('subscriptions.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, paid, overdue
    paid_date = db.Column(db.Date)
    invoice_number = db.Column(db.String(50), unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    subscription = db.relationship('Subscription', back_populates='invoices')


# ---------- Payment Split ----------
class PaymentSplit(db.Model):
    """When a rent payment is collected, auto-split into shares."""
    __tablename__ = 'payment_splits'

    id = db.Column(db.Integer, primary_key=True)
    payment_id = db.Column(db.Integer, db.ForeignKey('payments.id'), nullable=False)
    split_type = db.Column(db.String(30), nullable=False)  # owner_share, management_fee, agent_fee, ejar_fee
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(200))

    payment = db.relationship('Payment', backref=db.backref('splits', cascade='all, delete-orphan'))


# ---------- Audit Log ----------
class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    username = db.Column(db.String(80))
    action = db.Column(db.String(50), nullable=False)  # create, update, delete, login, etc.
    entity_type = db.Column(db.String(50))  # owner, building, unit, contract, payment, etc.
    entity_id = db.Column(db.String(50))
    details = db.Column(db.JSON)
    ip_address = db.Column(db.String(45))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    user = db.relationship('User', back_populates='audit_logs')

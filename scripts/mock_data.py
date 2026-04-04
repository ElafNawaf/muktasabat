"""
Realistic mock data for Muktasbat POC demos.
Gated by SEED_MOCK_DATA=true in the environment.

Creates:
  - 5 Owners (Saudi names) with bank info
  - 2-4 Buildings per owner (Riyadh districts)
  - 3-8 Units per building (apartments, shops, offices)
  - 10 Tenants
  - Contracts + auto-generated payment schedules
  - Some payments marked as paid (with auto-split)
  - 3 Employees assigned to owners
  - Subscriptions for 3 owners
  - Owner portal accounts for 2 owners
"""
import random
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta


def seed_mock_data(db):
    from app.models import (
        User, Owner, Building, Unit, Tenant, Contract, Payment,
        PaymentSplit, Employee, Subscription, SubscriptionInvoice,
        OwnerUser, Expense, employee_owners,
    )

    # Skip if data already exists
    if Owner.query.count() > 0:
        print('Mock data already exists — skipping.')
        return

    print('Seeding mock data...')

    # ── Owners ───────────────────────────────────────────────────────
    owners_data = [
        {'name': 'محمد بن عبدالله العتيبي',  'phone': '0501234567', 'email': 'mohammed@example.com', 'national_id': '1045678901', 'bank_name': 'البنك الأهلي',     'iban': 'SA0380000000608010167519'},
        {'name': 'عبدالرحمن بن سعود الشمري', 'phone': '0559876543', 'email': 'abdulrahman@example.com', 'national_id': '1078901234', 'bank_name': 'مصرف الراجحي',    'iban': 'SA6620000000000012345678'},
        {'name': 'فهد بن خالد الدوسري',      'phone': '0533456789', 'email': 'fahad@example.com',  'national_id': '1023456789', 'bank_name': 'بنك الرياض',       'iban': 'SA4420000000000087654321'},
        {'name': 'سلطان بن ناصر القحطاني',    'phone': '0547891234', 'email': 'sultan@example.com', 'national_id': '1056789012', 'bank_name': 'البنك السعودي الفرنسي', 'iban': 'SA8855000000000011223344'},
        {'name': 'خالد بن أحمد الغامدي',      'phone': '0562345678', 'email': 'khaled@example.com', 'national_id': '1089012345', 'bank_name': 'بنك البلاد',       'iban': 'SA1515000000000099887766'},
    ]

    owners = []
    for od in owners_data:
        o = Owner(**od)
        db.session.add(o)
        owners.append(o)
    db.session.flush()

    # ── Buildings ────────────────────────────────────────────────────
    districts = [
        ('العليا', 'Riyadh'),
        ('النخيل', 'Riyadh'),
        ('الملقا', 'Riyadh'),
        ('السليمانية', 'Riyadh'),
        ('الورود', 'Riyadh'),
        ('الحمراء', 'Jeddah'),
        ('الروضة', 'Jeddah'),
        ('النسيم', 'Riyadh'),
        ('الياسمين', 'Riyadh'),
        ('الصحافة', 'Riyadh'),
        ('العزيزية', 'Riyadh'),
        ('المروج', 'Riyadh'),
    ]

    building_names = [
        'برج السلام', 'عمارة النور', 'مجمع الياسمين', 'برج الأفق',
        'عمارة الريان', 'مجمع الخليج', 'برج الماسة', 'عمارة الورد',
        'مجمع الراحة', 'برج الصفا', 'عمارة التقوى', 'مجمع البستان',
        'برج الأمل', 'عمارة الفردوس', 'مجمع العروبة',
    ]

    random.shuffle(building_names)
    buildings = []
    bi = 0
    for owner in owners:
        n_buildings = random.randint(2, 4)
        for _ in range(n_buildings):
            district, city = random.choice(districts)
            b = Building(
                owner_id=owner.id,
                name=building_names[bi % len(building_names)],
                address=f'شارع الملك فهد، حي {district}',
                city=city,
                district=district,
            )
            db.session.add(b)
            buildings.append(b)
            bi += 1
    db.session.flush()

    # ── Units ────────────────────────────────────────────────────────
    unit_types = ['apartment', 'apartment', 'apartment', 'shop', 'office', 'warehouse']
    all_units = []
    for building in buildings:
        n_units = random.randint(3, 8)
        for i in range(1, n_units + 1):
            ut = random.choice(unit_types)
            rent = {
                'apartment': random.choice([3000, 3500, 4000, 4500, 5000, 5500, 6000]),
                'shop':      random.choice([8000, 10000, 12000, 15000]),
                'office':    random.choice([6000, 7000, 8000, 10000]),
                'warehouse': random.choice([4000, 5000, 6000]),
            }[ut]
            area = {
                'apartment': random.randint(80, 180),
                'shop':      random.randint(30, 120),
                'office':    random.randint(40, 150),
                'warehouse': random.randint(100, 400),
            }[ut]
            mgmt_pct = random.choice([5, 7.5, 10, 10, 10, 12.5])
            has_agent = random.random() < 0.3
            agent_names = ['علي الحربي', 'سعد المالكي', 'ياسر الزهراني', 'ماجد العنزي']
            u = Unit(
                building_id=building.id,
                name=f'{"شقة" if ut == "apartment" else "محل" if ut == "shop" else "مكتب" if ut == "office" else "مستودع"} {i}',
                number=f'{random.randint(1, 5)}{i:02d}',
                unit_type=ut,
                area_sqm=area,
                rent_amount=rent,
                management_percentage=mgmt_pct,
                agent_name=random.choice(agent_names) if has_agent else None,
                agent_percentage=random.choice([2.5, 3, 5]) if has_agent else 0,
                electric_invoice=f'10{random.randint(10000000, 99999999)}',
                water_invoice=f'20{random.randint(10000000, 99999999)}',
                ejar_fee=random.choice([200, 250, 300, 350]),
                is_available=True,
            )
            db.session.add(u)
            all_units.append(u)
    db.session.flush()

    # ── Tenants ──────────────────────────────────────────────────────
    tenants_data = [
        {'name': 'أحمد بن محمد السبيعي',   'phone': '0511111111', 'national_id': '2045678901'},
        {'name': 'يوسف بن عبدالله الحربي',  'phone': '0522222222', 'national_id': '2078901234'},
        {'name': 'عمر بن سالم المطيري',     'phone': '0533333333', 'national_id': '2023456789'},
        {'name': 'سعد بن فهد الزهراني',     'phone': '0544444444', 'national_id': '2056789012'},
        {'name': 'ماجد بن عبدالعزيز العنزي', 'phone': '0555555555', 'national_id': '2089012345'},
        {'name': 'تركي بن سعود الرشيدي',    'phone': '0566666666', 'national_id': '2012345678'},
        {'name': 'بدر بن ناصر الشهري',      'phone': '0577777777', 'national_id': '2034567890'},
        {'name': 'نايف بن خالد العمري',      'phone': '0588888888', 'national_id': '2067890123'},
        {'name': 'راكان بن سلمان البقمي',    'phone': '0599999999', 'national_id': '2090123456'},
        {'name': 'فيصل بن عبدالرحمن الشريف', 'phone': '0500000000', 'national_id': '2001234567'},
    ]

    tenants = []
    for td in tenants_data:
        t = Tenant(**td)
        db.session.add(t)
        tenants.append(t)
    db.session.flush()

    # ── Contracts & Payments ─────────────────────────────────────────
    today = date.today()
    contract_num = 1000
    units_to_rent = random.sample(all_units, k=min(len(tenants) + 5, len(all_units)))

    for i, unit in enumerate(units_to_rent):
        tenant = tenants[i % len(tenants)]
        cycle = random.choice([3, 6, 6, 12, 12])
        months_ago = random.randint(1, 18)
        start = today - relativedelta(months=months_ago)
        end = start + relativedelta(months=12)
        status = 'active' if end >= today else 'expired'

        contract_num += 1
        c = Contract(
            unit_id=unit.id,
            tenant_id=tenant.id,
            contract_number=f'C-{today.year}-{contract_num}',
            start_date=start,
            end_date=end,
            rent_amount=unit.rent_amount,
            payment_cycle=cycle,
            status=status,
        )
        db.session.add(c)
        unit.is_available = False
        db.session.flush()

        # Generate payment schedule
        current = start
        installment = unit.rent_amount * cycle
        while current < end:
            is_past = current < today
            is_paid = is_past and random.random() < 0.85  # 85% of past payments are paid

            p = Payment(
                contract_id=c.id,
                amount=installment,
                due_date=current,
                status='paid' if is_paid else 'pending',
                paid_date=(current + timedelta(days=random.randint(0, 5))) if is_paid else None,
                payment_method=random.choice(['bank_transfer', 'bank_transfer', 'cash', 'cheque']) if is_paid else None,
                receipt_number=f'RCT-{random.randint(10000, 99999)}' if is_paid else None,
            )
            db.session.add(p)
            db.session.flush()

            # Auto-split for paid payments
            if is_paid:
                mgmt_pct = unit.management_percentage or 0
                agent_pct = unit.agent_percentage or 0
                mgmt_fee = round(installment * mgmt_pct / 100, 2)
                agent_fee = round(installment * agent_pct / 100, 2)
                ejar = round(unit.ejar_fee or 0, 2)
                owner_share = round(installment - mgmt_fee - agent_fee - ejar, 2)

                if mgmt_fee > 0:
                    db.session.add(PaymentSplit(payment_id=p.id, split_type='management_fee', amount=mgmt_fee, description=f'{mgmt_pct}% management fee'))
                if agent_fee > 0:
                    db.session.add(PaymentSplit(payment_id=p.id, split_type='agent_fee', amount=agent_fee, description=f'{agent_pct}% agent fee ({unit.agent_name or ""})'))
                if ejar > 0:
                    db.session.add(PaymentSplit(payment_id=p.id, split_type='ejar_fee', amount=ejar, description='Ejar platform fee'))
                db.session.add(PaymentSplit(payment_id=p.id, split_type='owner_share', amount=owner_share, description='Net amount to owner'))

            current += relativedelta(months=cycle)

    # ── Expenses ─────────────────────────────────────────────────────
    expense_templates = [
        ('maintenance', 'صيانة مكيفات', 800, 2500),
        ('maintenance', 'إصلاح سباكة', 300, 1200),
        ('maintenance', 'دهان وتجديد', 1500, 5000),
        ('utilities', 'فاتورة كهرباء مشتركة', 500, 2000),
        ('utilities', 'فاتورة مياه مشتركة', 200, 800),
        ('cleaning', 'تنظيف مبنى', 1000, 3000),
        ('security', 'حراسة أمنية', 2000, 4000),
        ('insurance', 'تأمين مبنى', 3000, 8000),
        ('government_fees', 'رسوم بلدية', 500, 2000),
        ('legal', 'استشارة قانونية', 1000, 5000),
        ('marketing', 'إعلان وحدات شاغرة', 500, 2000),
        ('other', 'مصاريف متنوعة', 200, 1000),
    ]
    for _ in range(40):
        cat, desc, min_amt, max_amt = random.choice(expense_templates)
        owner = random.choice(owners)
        building = random.choice(owner.buildings) if owner.buildings else None
        months_ago = random.randint(0, 11)
        exp_date = today - relativedelta(months=months_ago) - timedelta(days=random.randint(0, 28))
        e = Expense(
            owner_id=owner.id,
            building_id=building.id if building else None,
            category=cat,
            description=desc,
            amount=round(random.uniform(min_amt, max_amt), 2),
            expense_date=exp_date,
            paid_by=random.choice(['company', 'company', 'owner', 'tenant']),
            vendor_name=random.choice(['شركة الصيانة المتقدمة', 'مؤسسة النظافة', 'شركة الحراسات', 'مكتب المحاماة', '']),
            receipt_number=f'EXP-{random.randint(10000, 99999)}',
        )
        db.session.add(e)

    # ── Employees ────────────────────────────────────────────────────
    emp_users = [
        {'username': 'sara',  'email': 'sara@muktasbat.com',  'name': 'سارة الدوسري',  'phone': '0501112233'},
        {'username': 'omar',  'email': 'omar@muktasbat.com',  'name': 'عمر السالم',     'phone': '0502223344'},
        {'username': 'nora',  'email': 'nora@muktasbat.com',  'name': 'نورة القحطاني',  'phone': '0503334455'},
    ]
    for i, ed in enumerate(emp_users):
        u = User(username=ed['username'], email=ed['email'], role='manager')
        u.set_password('pass123')
        db.session.add(u)
        db.session.flush()
        emp = Employee(user_id=u.id, name=ed['name'], phone=ed['phone'])
        db.session.add(emp)
        db.session.flush()
        # Assign ~2 owners each
        assigned = owners[i * 2: i * 2 + 2] if i * 2 + 2 <= len(owners) else [owners[i % len(owners)]]
        for owner in assigned:
            emp.owners.append(owner)

    # ── Subscriptions ────────────────────────────────────────────────
    plans = [
        (owners[0], 'enterprise'),
        (owners[1], 'pro'),
        (owners[2], 'basic'),
    ]
    for owner, plan in plans:
        info = Subscription.PLANS[plan]
        sub = Subscription(
            owner_id=owner.id,
            plan=plan,
            max_units=info['max_units'],
            price_monthly=info['price'],
            start_date=today - relativedelta(months=3),
            status='active',
        )
        db.session.add(sub)
        db.session.flush()

        # Generate 3 months of invoices (paid)
        for m in range(3):
            inv_start = today - relativedelta(months=3 - m)
            inv_end = inv_start + relativedelta(months=1) - timedelta(days=1)
            inv = SubscriptionInvoice(
                subscription_id=sub.id,
                amount=info['price'],
                period_start=inv_start,
                period_end=inv_end,
                status='paid',
                paid_date=inv_start + timedelta(days=random.randint(0, 3)),
                invoice_number=f'SUB-{inv_start.strftime("%Y%m")}-{owner.id:04d}',
            )
            db.session.add(inv)

    # ── Owner Portal Accounts ────────────────────────────────────────
    owner_accounts = [
        (owners[0], 'owner_mohammed', 'mohammed@example.com'),
        (owners[1], 'owner_abdulrahman', 'abdulrahman@example.com'),
    ]
    for owner, username, email in owner_accounts:
        ou = User(username=username, email=f'portal_{email}', role='owner')
        ou.set_password('owner123')
        db.session.add(ou)
        db.session.flush()
        link = OwnerUser(owner_id=owner.id, user_id=ou.id)
        db.session.add(link)

    db.session.commit()

    # Summary
    print(f'  Owners:        {Owner.query.count()}')
    print(f'  Buildings:     {Building.query.count()}')
    print(f'  Units:         {Unit.query.count()}')
    print(f'  Tenants:       {Tenant.query.count()}')
    print(f'  Contracts:     {Contract.query.count()}')
    print(f'  Payments:      {Payment.query.count()}')
    print(f'  Payment Splits:{PaymentSplit.query.count()}')
    print(f'  Employees:     {Employee.query.count()}')
    print(f'  Subscriptions: {Subscription.query.count()}')
    print(f'  Owner Accounts:{OwnerUser.query.count()}')
    print('Mock data seeded!')
    print('  Owner logins: owner_mohammed / owner123, owner_abdulrahman / owner123')

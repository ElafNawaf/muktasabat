"""JSON API routes for the drill-down page."""
from flask import Blueprint, jsonify
from flask_login import login_required
from app import db
from app.i18n_data import localized_value
from app.models import Owner, Building, Unit, Contract, Payment, Tenant

api_bp = Blueprint('api', __name__, url_prefix='/api')


@api_bp.route('/owners')
@login_required
def owners():
    owners = Owner.query.order_by(Owner.name).all()
    result = []
    for o in owners:
        building_count = len(o.buildings)
        unit_count = sum(len(b.units) for b in o.buildings)
        contract_count = sum(
            len(u.contracts) for b in o.buildings for u in b.units
        )
        result.append({
            'id': o.id,
            'name': localized_value(o, 'name'),
            'phone': o.phone,
            'national_id': o.national_id,
            'building_count': building_count,
            'unit_count': unit_count,
            'contract_count': contract_count,
        })
    return jsonify(result)


@api_bp.route('/owners/<int:owner_id>')
@login_required
def owner_detail(owner_id):
    owner = db.session.get(Owner, owner_id)
    if not owner:
        return jsonify({'error': 'Not found'}), 404

    buildings = []
    for b in owner.buildings:
        units = []
        for u in b.units:
            contracts = []
            for c in u.contracts:
                payments = []
                for p in sorted(c.payments, key=lambda x: x.due_date):
                    payments.append({
                        'id': p.id,
                        'due_date': p.due_date.isoformat(),
                        'amount': p.amount,
                        'status': p.status,
                        'paid_date': p.paid_date.isoformat() if p.paid_date else None,
                        'payment_method': p.payment_method,
                    })
                contracts.append({
                    'id': c.id,
                    'contract_number': c.contract_number,
                    'tenant_name': localized_value(c.tenant, 'name'),
                    'tenant_phone': c.tenant.phone,
                    'tenant_national_id': c.tenant.national_id,
                    'start_date': c.start_date.isoformat(),
                    'end_date': c.end_date.isoformat(),
                    'rent_amount': c.rent_amount,
                    'payment_cycle': c.payment_cycle,
                    'status': c.status,
                    'management_fee': c.management_fee,
                    'agent_fee': c.agent_fee,
                    'payments': payments,
                })
            units.append({
                'id': u.id,
                'number': u.number,
                'name': localized_value(u, 'name'),
                'unit_type': u.unit_type,
                'rent_amount': u.rent_amount,
                'is_available': u.is_available,
                'management_percentage': u.management_percentage,
                'agent_name': u.agent_name,
                'agent_percentage': u.agent_percentage,
                'electric_invoice': u.electric_invoice,
                'water_invoice': u.water_invoice,
                'ejar_fee': u.ejar_fee,
                'contracts': contracts,
            })
        buildings.append({
            'id': b.id,
            'name': localized_value(b, 'name'),
            'address': localized_value(b, 'address'),
            'city': localized_value(b, 'city'),
            'district': localized_value(b, 'district'),
            'units': units,
        })

    return jsonify({
        'owner': {
            'id': owner.id,
            'name': localized_value(owner, 'name'),
            'phone': owner.phone,
            'email': owner.email,
            'national_id': owner.national_id,
            'bank_name': owner.bank_name,
            'iban': owner.iban,
        },
        'buildings': buildings,
    })


@api_bp.route('/stats')
@login_required
def stats():
    return jsonify({
        'owners': Owner.query.count(),
        'buildings': Building.query.count(),
        'units': Unit.query.count(),
        'contracts': Contract.query.filter_by(status='active').count(),
        'payments_pending': Payment.query.filter_by(status='pending').count(),
    })

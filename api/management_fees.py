"""Compute the management fee figures shown on a management contract.

Ejar records the expected annual value of the mandate (أتعاب الإدارة) on the
contract, so the portal derives it from the fee terms plus the annual rent roll
of the properties placed under management.
"""


def compute_management_fee(
    *,
    fee_type: str,
    fee_percentage: float,
    fee_fixed_amount: float,
    annual_rent_base: float = 0,
    vat_rate: float = 15.0,
) -> tuple[float, float, float]:
    """Return (estimated_annual_fee, vat_amount, total_fee_amount).

    ``annual_rent_base`` is the yearly rent of the managed portfolio; it is only
    used when the fee is a percentage. A fixed fee ignores it entirely.
    """
    if (fee_type or "percentage") == "fixed":
        base = float(fee_fixed_amount or 0)
    else:
        base = float(annual_rent_base or 0) * (float(fee_percentage or 0) / 100)

    base = round(base, 2)
    rate = float(vat_rate if vat_rate is not None else 15.0)
    vat_amount = round(base * (rate / 100), 2)
    return base, vat_amount, round(base + vat_amount, 2)

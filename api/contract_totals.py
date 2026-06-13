"""Compute contract VAT and grand total from billing line items."""


def compute_contract_totals(
    *,
    total_rent_amount: float,
    insurance_amount: float,
    electricity_amount: float,
    water_amount: float,
    services_amount: float = 0,
    vat_rate: float = 15.0,
) -> tuple[float, float, float]:
    """Return (vat_rate, vat_amount, total_amount)."""
    subtotal = (
        float(total_rent_amount or 0)
        + float(insurance_amount or 0)
        + float(electricity_amount or 0)
        + float(water_amount or 0)
        + float(services_amount or 0)
    )
    rate = float(vat_rate if vat_rate is not None else 15.0)
    vat_amount = round(subtotal * (rate / 100), 2)
    total_amount = round(subtotal + vat_amount, 2)
    return rate, vat_amount, total_amount

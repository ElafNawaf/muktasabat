/** Contract subtotal, VAT, and grand total (Saudi VAT default 15%). */

export type ContractTotalsInput = {
  total_rent_amount?: number;
  insurance_amount?: number;
  electricity_amount?: number;
  water_amount?: number;
  services_amount?: number;
  vat_rate?: number;
};

/** Monthly rent × payment count × cycle months (e.g. 12 monthly payments = rent × 1 × 12). */
export function computeTotalRentAmount(
  rentAmount: number,
  paymentCount: number,
  paymentCycle: number,
): number {
  const rent = Number(rentAmount) || 0;
  const count = Number(paymentCount) || 1;
  const cycle = Number(paymentCycle) || 1;
  return Math.round(rent * count * cycle * 100) / 100;
}

export function computeContractTotals(input: ContractTotalsInput) {
  const subtotal =
    (Number(input.total_rent_amount) || 0) +
    (Number(input.insurance_amount) || 0) +
    (Number(input.electricity_amount) || 0) +
    (Number(input.water_amount) || 0) +
    (Number(input.services_amount) || 0);
  const vatRate = Number(input.vat_rate ?? 15) || 0;
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatRate, vatAmount, totalAmount };
}

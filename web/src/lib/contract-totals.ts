/** Contract subtotal, VAT, and grand total (Saudi VAT default 15%). */

export type ContractTotalsInput = {
  total_rent_amount?: number;
  insurance_amount?: number;
  electricity_amount?: number;
  water_amount?: number;
  vat_rate?: number;
};

export function computeContractTotals(input: ContractTotalsInput) {
  const subtotal =
    (Number(input.total_rent_amount) || 0) +
    (Number(input.insurance_amount) || 0) +
    (Number(input.electricity_amount) || 0) +
    (Number(input.water_amount) || 0);
  const vatRate = Number(input.vat_rate ?? 15) || 0;
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatRate, vatAmount, totalAmount };
}

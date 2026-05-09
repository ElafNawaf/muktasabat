"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { DocumentUploader } from "@/components/DocumentUploader";
import { Modal } from "@/components/Modal";
import {
  createContract,
  updateContract,
  type ContractInput,
  type PaymentCycle,
} from "@/lib/actions";
import { localized, type Building, type Contract, type Tenant, type Unit } from "@/lib/types";

const CYCLES: PaymentCycle[] = [1, 3, 6, 12];
const CONTRACT_TYPES = ["residential", "commercial"] as const;
const VALIDITY_TYPES = ["fixed", "open"] as const;
const PAYMENT_TYPES = ["monthly", "quarterly", "semi-annual", "annual", "full"] as const;

export function ContractFormModal({
  open,
  onClose,
  units,
  tenants,
  buildings,
  contracts,
  locale,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  units: Unit[];
  tenants: Tenant[];
  buildings: Building[];
  contracts: Contract[];
  locale: string;
  editing?: Contract | null;
}) {
  const isEdit = Boolean(editing);
  const t = useTranslations("contractsPage");
  const tCommon = useTranslations("common");

  const occupiedUnitIds = new Set(
    contracts.filter((c) => c.status === "active").map((c) => c.unit_id),
  );
  const availableUnits = units.filter(
    (u) => !occupiedUnitIds.has(u.id) || u.id === editing?.unit_id,
  );

  const today = new Date().toISOString().slice(0, 10);
  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [form, setForm] = useState<ContractInput>(() =>
    editing
      ? {
          unit_id: editing.unit_id,
          tenant_id: editing.tenant_id,
          contract_number: editing.contract_number,
          branch: editing.branch ?? "",
          contract_type: (editing.contract_type as "residential" | "commercial") ?? "residential",
          validity_type: (editing.validity_type as "fixed" | "open" | null) ?? null,
          start_date: editing.start_date,
          end_date: editing.end_date,
          duration_years: editing.duration_years,
          duration_months: editing.duration_months,
          duration_days: editing.duration_days,
          total_rent_amount: editing.total_rent_amount,
          rent_amount: editing.rent_amount,
          ejar_contract_number: editing.ejar_contract_number ?? "",
          payment_type: (editing.payment_type as ContractInput["payment_type"]) ?? null,
          payment_count: editing.payment_count,
          payment_cycle: editing.payment_cycle as PaymentCycle,
          electricity_on_tenant: editing.electricity_on_tenant,
          electricity_split_percentage: editing.electricity_split_percentage,
          water_on_tenant: editing.water_on_tenant,
          water_split_percentage: editing.water_split_percentage,
          services_amount: editing.services_amount,
          insurance_amount: editing.insurance_amount,
          notes: editing.notes ?? "",
        }
      : {
          unit_id: availableUnits[0]?.id ?? 0,
          tenant_id: tenants[0]?.id ?? 0,
          contract_number: `CT-${Date.now().toString().slice(-8)}`,
          branch: "",
          contract_type: "residential",
          validity_type: "fixed",
          start_date: today,
          end_date: oneYear,
          duration_years: 1,
          duration_months: 0,
          duration_days: 0,
          total_rent_amount: (availableUnits[0]?.rent_amount ?? 0) * 12,
          rent_amount: availableUnits[0]?.rent_amount ?? 0,
          ejar_contract_number: "",
          payment_type: "annual",
          payment_count: 1,
          payment_cycle: 12,
          electricity_on_tenant: true,
          electricity_split_percentage: null,
          water_on_tenant: true,
          water_split_percentage: null,
          services_amount: 0,
          insurance_amount: 0,
          notes: "",
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ContractInput>(k: K, v: ContractInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onUnitChange = (unitId: number) => {
    const u = units.find((x) => x.id === unitId);
    setForm((f) => ({ ...f, unit_id: unitId, rent_amount: u?.rent_amount ?? f.rent_amount }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.unit_id) return setError(t("unitRequired"));
    if (!form.tenant_id) return setError(t("tenantRequired"));
    if (!form.contract_number.trim()) return setError(t("contractNumberRequired"));
    if (form.end_date <= form.start_date) return setError(t("dateOrderInvalid"));
    const payload: ContractInput = {
      ...form,
      contract_number: form.contract_number.trim(),
      branch: form.branch?.toString().trim() || null,
      ejar_contract_number: form.ejar_contract_number?.toString().trim() || null,
      rent_amount: Number(form.rent_amount),
      total_rent_amount: Number(form.total_rent_amount) || 0,
      services_amount: Number(form.services_amount) || 0,
      insurance_amount: Number(form.insurance_amount) || 0,
      duration_years: Number(form.duration_years) || 0,
      duration_months: Number(form.duration_months) || 0,
      duration_days: Number(form.duration_days) || 0,
      payment_count: Number(form.payment_count) || 1,
      electricity_split_percentage:
        form.electricity_on_tenant === false && form.electricity_split_percentage != null
          ? Number(form.electricity_split_percentage)
          : null,
      water_split_percentage:
        form.water_on_tenant === false && form.water_split_percentage != null
          ? Number(form.water_split_percentage)
          : null,
      notes: form.notes?.toString().trim() || null,
    };
    start(async () => {
      const res = isEdit && editing
        ? await updateContract(editing.id, {
            ...payload,
            status: editing.status,
          })
        : await createContract(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  const buildingOf = (unitId: number) => {
    const u = units.find((x) => x.id === unitId);
    return u ? buildings.find((b) => b.id === u.building_id) : null;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("editTitle") : t("createTitle")}
      subtitle={isEdit ? t("editSubtitle") : t("createSubtitle")}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="contract-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="contract-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        {availableUnits.length === 0 && !isEdit && (
          <div className="badge badge-warning" style={{ padding: "8px 12px", fontSize: 12 }}>
            {t("noAvailableUnits")}
          </div>
        )}

        <CollapsibleSection title={t("sectionParties")} icon="people" defaultOpen>
          <div className="field">
            <label>
              {t("unit")} <span className="req">*</span>
            </label>
            <select
              className="select"
              value={form.unit_id || ""}
              onChange={(e) => onUnitChange(Number(e.target.value))}
              required
              disabled={isEdit}
            >
              <option value="" disabled>
                {t("selectUnit")}
              </option>
              {availableUnits.map((u) => {
                const b = buildingOf(u.id);
                return (
                  <option key={u.id} value={u.id}>
                    {b ? localized(b, "name", locale) : "?"} · {localized(u, "name", locale)} · #{u.number}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label>
              {t("tenant")} <span className="req">*</span>
            </label>
            <select
              className="select"
              value={form.tenant_id || ""}
              onChange={(e) => set("tenant_id", Number(e.target.value))}
              required
              disabled={isEdit}
            >
              <option value="" disabled>
                {t("selectTenant")}
              </option>
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {localized(tn, "name", locale)} · {tn.phone}
                </option>
              ))}
            </select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionBasic")} icon="description" defaultOpen>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>
                {t("contractNumber")} <span className="req">*</span>
              </label>
              <input
                className="input input-mono"
                value={form.contract_number}
                onChange={(e) => set("contract_number", e.target.value)}
                required
                maxLength={50}
                dir="ltr"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("branch")}</label>
              <input
                className="input"
                value={form.branch ?? ""}
                onChange={(e) => set("branch", e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("contractTypeLabel")}</label>
              <select
                className="select"
                value={form.contract_type ?? "residential"}
                onChange={(e) => set("contract_type", e.target.value as "residential" | "commercial")}
              >
                {CONTRACT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`contractTypes.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("validityType")}</label>
              <select
                className="select"
                value={form.validity_type ?? ""}
                onChange={(e) =>
                  set("validity_type", (e.target.value || null) as "fixed" | "open" | null)
                }
              >
                <option value="">—</option>
                {VALIDITY_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`validityTypes.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1.4 }}>
              <label>{t("ejarContractNumber")}</label>
              <input
                className="input input-mono"
                value={form.ejar_contract_number ?? ""}
                onChange={(e) => set("ejar_contract_number", e.target.value)}
                maxLength={50}
                dir="ltr"
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("startDate")}</label>
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("endDate")}</label>
              <input
                className="input"
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("durationYears")}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.duration_years ?? 0}
                onChange={(e) => set("duration_years", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("durationMonths")}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={11}
                value={form.duration_months ?? 0}
                onChange={(e) => set("duration_months", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("durationDays")}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={30}
                value={form.duration_days ?? 0}
                onChange={(e) => set("duration_days", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("rent")} (SAR / installment)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.rent_amount}
                onChange={(e) => set("rent_amount", Number(e.target.value))}
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("totalRentAmount")} (SAR)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.total_rent_amount ?? 0}
                onChange={(e) => set("total_rent_amount", Number(e.target.value))}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionBilling")} icon="payments">
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("paymentType")}</label>
              <select
                className="select"
                value={form.payment_type ?? ""}
                onChange={(e) =>
                  set("payment_type", (e.target.value || null) as ContractInput["payment_type"])
                }
              >
                <option value="">—</option>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {t(`paymentTypes.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("paymentCount")}</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.payment_count ?? 1}
                onChange={(e) => set("payment_count", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("cycle")}</label>
              <select
                className="select"
                value={form.payment_cycle}
                onChange={(e) => set("payment_cycle", Number(e.target.value) as PaymentCycle)}
              >
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c} {t("months")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("servicesAmount")} (SAR)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.services_amount ?? 0}
                onChange={(e) => set("services_amount", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("insuranceAmount")} (SAR)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.insurance_amount ?? 0}
                onChange={(e) => set("insurance_amount", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.electricity_on_tenant ?? true}
                  onChange={(e) => set("electricity_on_tenant", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("electricityOnTenant")}
              </label>
              {!form.electricity_on_tenant && (
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  placeholder={t("splitPctPlaceholder")}
                  value={form.electricity_split_percentage ?? ""}
                  onChange={(e) =>
                    set(
                      "electricity_split_percentage",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.water_on_tenant ?? true}
                  onChange={(e) => set("water_on_tenant", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("waterOnTenant")}
              </label>
              {!form.water_on_tenant && (
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  placeholder={t("splitPctPlaceholder")}
                  value={form.water_split_percentage ?? ""}
                  onChange={(e) =>
                    set(
                      "water_split_percentage",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionAttachments")} icon="folder" defaultOpen={false}>
          <DocumentUploader
            kind="contracts"
            relation="attachments"
            entityId={editing?.id ?? null}
            documents={editing?.attachments ?? []}
          />
        </CollapsibleSection>

        <CollapsibleSection title={t("notes")} icon="notes" defaultOpen={false}>
          <textarea
            className="textarea"
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </CollapsibleSection>
      </form>
    </Modal>
  );
}

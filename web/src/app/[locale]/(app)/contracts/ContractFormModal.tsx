"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import {
  createContract,
  updateContract,
  type ContractInput,
} from "@/lib/actions";
import { localized, type Building, type Contract, type Tenant, type Unit } from "@/lib/types";

const CYCLES = [3, 6, 12] as const;

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
          start_date: editing.start_date,
          end_date: editing.end_date,
          rent_amount: editing.rent_amount,
          payment_cycle: editing.payment_cycle as 3 | 6 | 12,
          notes: editing.notes ?? "",
        }
      : {
          unit_id: availableUnits[0]?.id ?? 0,
          tenant_id: tenants[0]?.id ?? 0,
          contract_number: `CT-${Date.now().toString().slice(-8)}`,
          start_date: today,
          end_date: oneYear,
          rent_amount: availableUnits[0]?.rent_amount ?? 0,
          payment_cycle: 12,
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
      rent_amount: Number(form.rent_amount),
      notes: form.notes?.toString().trim() || null,
    };
    start(async () => {
      const res = isEdit && editing
        ? await updateContract(editing.id, {
            contract_number: payload.contract_number,
            start_date: payload.start_date,
            end_date: payload.end_date,
            rent_amount: payload.rent_amount,
            payment_cycle: payload.payment_cycle,
            status: editing.status,
            notes: payload.notes ?? null,
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
      size="md"
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
        {availableUnits.length === 0 && (
          <div className="badge badge-warning" style={{ padding: "8px 12px", fontSize: 12 }}>
            {t("noAvailableUnits")}
          </div>
        )}
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
        <div className="field">
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
            <label>{t("rent")} (SAR/year)</label>
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
            <label>{t("cycle")}</label>
            <select
              className="select"
              value={form.payment_cycle}
              onChange={(e) => set("payment_cycle", Number(e.target.value) as 3 | 6 | 12)}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {c} {t("months")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t("notes")}</label>
          <textarea
            className="textarea"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}

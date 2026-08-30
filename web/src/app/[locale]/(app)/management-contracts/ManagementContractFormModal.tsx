"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { DocumentUploader } from "@/components/DocumentUploader";
import { Modal } from "@/components/Modal";
import {
  createManagementContract,
  updateManagementContract,
  type ManagementContractInput,
  type ManagementPropertyInput,
} from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import {
  localized,
  type Building,
  type ManagementContract,
  type ManagementFeeCollection,
  type ManagementFeeType,
  type Owner,
  type Unit,
} from "@/lib/types";

const FEE_TYPES: ManagementFeeType[] = ["percentage", "fixed"];
const FEE_COLLECTION: ManagementFeeCollection[] = ["deduct_from_rent", "invoice_owner"];

export function ManagementContractFormModal({
  open,
  onClose,
  owners,
  buildings,
  units,
  locale,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  locale: string;
  editing?: ManagementContract | null;
}) {
  const isEdit = Boolean(editing);
  const t = useTranslations("managementContracts");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const today = new Date().toISOString().slice(0, 10);
  const inTwoYears = new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState<ManagementContractInput>(() =>
    editing
      ? {
          owner_id: editing.owner_id,
          contract_number: editing.contract_number,
          ejar_contract_number: editing.ejar_contract_number ?? "",
          branch: editing.branch ?? "",
          contract_date: editing.contract_date ?? today,
          start_date: editing.start_date,
          end_date: editing.end_date,
          duration_months: editing.duration_months,
          auto_renew: editing.auto_renew,
          notice_period_days: editing.notice_period_days,
          fee_type: editing.fee_type,
          fee_percentage: editing.fee_percentage,
          fee_fixed_amount: editing.fee_fixed_amount,
          fee_collection_method: editing.fee_collection_method,
          vat_rate: editing.vat_rate,
          payout_cycle_months: editing.payout_cycle_months,
          can_market_units: editing.can_market_units,
          can_sign_leases: editing.can_sign_leases,
          can_collect_rent: editing.can_collect_rent,
          can_evict: editing.can_evict,
          can_maintain: editing.can_maintain,
          can_pay_utilities: editing.can_pay_utilities,
          maintenance_limit_amount: editing.maintenance_limit_amount,
          notes: editing.notes ?? "",
          properties: editing.properties.map((p) => ({
            building_id: p.building_id,
            unit_id: p.unit_id,
            fee_percentage_override: p.fee_percentage_override,
          })),
        }
      : {
          owner_id: owners[0]?.id ?? 0,
          contract_number: `MGT-${Date.now().toString().slice(-8)}`,
          ejar_contract_number: "",
          branch: "",
          contract_date: today,
          start_date: today,
          end_date: inTwoYears,
          duration_months: 24,
          auto_renew: false,
          notice_period_days: 30,
          fee_type: "percentage",
          fee_percentage: 5,
          fee_fixed_amount: 0,
          fee_collection_method: "deduct_from_rent",
          vat_rate: 15,
          payout_cycle_months: 1,
          can_market_units: true,
          can_sign_leases: true,
          can_collect_rent: true,
          can_evict: false,
          can_maintain: true,
          can_pay_utilities: false,
          maintenance_limit_amount: 0,
          notes: "",
          properties: [],
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ManagementContractInput>(
    k: K,
    v: ManagementContractInput[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  // Only the selected owner's buildings can be placed under this mandate —
  // Ejar rejects a portfolio entry that belongs to a different landlord.
  const ownerBuildings = useMemo(
    () => buildings.filter((b) => b.owner_id === form.owner_id),
    [buildings, form.owner_id],
  );

  const selectedBuildingIds = new Set(form.properties.map((p) => p.building_id));

  const annualRentBase = useMemo(() => {
    const seen = new Set<number>();
    let total = 0;
    for (const p of form.properties) {
      if (p.unit_id != null) {
        const u = units.find((x) => x.id === p.unit_id);
        if (u && !seen.has(u.id)) {
          seen.add(u.id);
          total += (u.rent_amount || 0) * 12;
        }
        continue;
      }
      for (const u of units) {
        if (u.building_id !== p.building_id || seen.has(u.id)) continue;
        seen.add(u.id);
        total += (u.rent_amount || 0) * 12;
      }
    }
    return total;
  }, [form.properties, units]);

  const feePreview = useMemo(() => {
    const base =
      form.fee_type === "fixed"
        ? Number(form.fee_fixed_amount) || 0
        : (annualRentBase * (Number(form.fee_percentage) || 0)) / 100;
    const rate = Number(form.vat_rate ?? 15) || 0;
    const vat = Math.round(base * (rate / 100) * 100) / 100;
    return {
      base: Math.round(base * 100) / 100,
      vat,
      total: Math.round((base + vat) * 100) / 100,
    };
  }, [form.fee_type, form.fee_fixed_amount, form.fee_percentage, form.vat_rate, annualRentBase]);

  const toggleBuilding = (buildingId: number) => {
    setForm((f) => {
      const has = f.properties.some((p) => p.building_id === buildingId);
      return {
        ...f,
        properties: has
          ? f.properties.filter((p) => p.building_id !== buildingId)
          : [...f.properties, { building_id: buildingId, unit_id: null }],
      };
    });
  };

  const setScope = (buildingId: number, unitId: number | null) => {
    setForm((f) => {
      const others = f.properties.filter((p) => p.building_id !== buildingId);
      const entries: ManagementPropertyInput[] =
        unitId === null
          ? [{ building_id: buildingId, unit_id: null }]
          : [{ building_id: buildingId, unit_id: unitId }];
      return { ...f, properties: [...others, ...entries] };
    });
  };

  const onOwnerChange = (ownerId: number) => {
    // Dropping the portfolio is intentional: entries from the previous owner
    // would be rejected by the API anyway.
    setForm((f) => ({ ...f, owner_id: ownerId, properties: [] }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.owner_id) return setError(t("ownerRequired"));
    if (!form.contract_number.trim()) return setError(t("contractNumberRequired"));
    if (form.end_date <= form.start_date) return setError(t("dateOrderInvalid"));
    if (form.properties.length === 0) return setError(t("propertiesRequired"));
    if (form.fee_type === "percentage" && !(Number(form.fee_percentage) > 0))
      return setError(t("feePercentageRequired"));
    if (form.fee_type === "fixed" && !(Number(form.fee_fixed_amount) > 0))
      return setError(t("feeFixedRequired"));

    const payload: ManagementContractInput = {
      ...form,
      contract_number: form.contract_number.trim(),
      ejar_contract_number: form.ejar_contract_number?.toString().trim() || null,
      branch: form.branch?.toString().trim() || null,
      fee_percentage: Number(form.fee_percentage) || 0,
      fee_fixed_amount: Number(form.fee_fixed_amount) || 0,
      vat_rate: Number(form.vat_rate ?? 15) || 0,
      duration_months: Number(form.duration_months) || 1,
      notice_period_days: Number(form.notice_period_days) || 0,
      payout_cycle_months: Number(form.payout_cycle_months) || 1,
      maintenance_limit_amount: Number(form.maintenance_limit_amount) || 0,
      notes: form.notes?.toString().trim() || null,
    };

    start(async () => {
      const res =
        isEdit && editing
          ? await updateManagementContract(editing.id, {
              ...payload,
              status: editing.status,
            })
          : await createManagementContract(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
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
          <button
            type="submit"
            form="management-contract-form"
            className="btn btn-primary"
            disabled={pending}
          >
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form
        id="management-contract-form"
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {error && (
          <div
            className="badge badge-danger"
            style={{ padding: "8px 12px", fontSize: 12, whiteSpace: "pre-line", lineHeight: 1.6 }}
          >
            {error}
          </div>
        )}

        <CollapsibleSection title={t("sectionParties")} icon="people" defaultOpen>
          <div className="field">
            <label>
              {t("owner")} <span className="req">*</span>
            </label>
            <select
              className="select"
              value={form.owner_id || ""}
              onChange={(e) => onOwnerChange(Number(e.target.value))}
              required
              disabled={isEdit}
            >
              <option value="" disabled>
                {t("selectOwner")}
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {localized(o, "name", locale)}
                  {o.national_id ? ` · ${o.national_id}` : ""}
                </option>
              ))}
            </select>
            <div className="text-sec" style={{ fontSize: 11.5, marginTop: 4 }}>
              {t("ownerHint")}
            </div>
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
            <div className="field" style={{ flex: 2 }}>
              <label>{t("ejarContractNumber")}</label>
              <input
                className="input input-mono"
                value={form.ejar_contract_number ?? ""}
                onChange={(e) => set("ejar_contract_number", e.target.value)}
                maxLength={50}
                dir="ltr"
                placeholder={t("ejarNumberPlaceholder")}
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
              <label>{t("contractDate")}</label>
              <input
                className="input"
                type="date"
                value={form.contract_date ?? ""}
                onChange={(e) => set("contract_date", e.target.value || null)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>
                {t("startDate")} <span className="req">*</span>
              </label>
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>
                {t("endDate")} <span className="req">*</span>
              </label>
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
              <label>{t("durationMonths")}</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.duration_months ?? 12}
                onChange={(e) => set("duration_months", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("noticePeriodDays")}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                value={form.notice_period_days ?? 30}
                onChange={(e) => set("notice_period_days", Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ flex: 1, justifyContent: "flex-end" }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.auto_renew ?? false}
                  onChange={(e) => set("auto_renew", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("autoRenew")}
              </label>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionPortfolio")} icon="domain" defaultOpen>
          {ownerBuildings.length === 0 ? (
            <div className="badge badge-warning" style={{ padding: "8px 12px", fontSize: 12 }}>
              {t("noBuildingsForOwner")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="text-sec" style={{ fontSize: 11.5 }}>
                {t("portfolioHint")}
              </div>
              {ownerBuildings.map((b) => {
                const entry = form.properties.find((p) => p.building_id === b.id);
                const selected = Boolean(entry);
                const buildingUnits = units.filter((u) => u.building_id === b.id);
                return (
                  <div
                    key={b.id}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      background: selected ? "var(--color-primary-soft)" : "transparent",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleBuilding(b.id)}
                      />
                      <span style={{ fontWeight: 500, fontSize: 13 }}>
                        {localized(b, "name", locale)}
                      </span>
                      <span className="text-sec" style={{ fontSize: 11.5 }}>
                        {b.deed_number ? `${t("deed")} ${b.deed_number}` : t("noDeed")} ·{" "}
                        {buildingUnits.length} {t("unitsShort")}
                      </span>
                    </label>
                    {selected && (
                      <div style={{ marginTop: 8, paddingInlineStart: 26 }}>
                        <select
                          className="select"
                          value={entry?.unit_id ?? ""}
                          onChange={(e) =>
                            setScope(b.id, e.target.value === "" ? null : Number(e.target.value))
                          }
                        >
                          <option value="">{t("wholeBuilding")}</option>
                          {buildingUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {t("onlyUnit")} {localized(u, "name", locale)} · #{u.number}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="text-sec" style={{ fontSize: 11.5 }}>
                {t("selectedCount", { count: selectedBuildingIds.size })}
              </div>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionFee")} icon="payments" defaultOpen>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("feeType")}</label>
              <select
                className="select"
                value={form.fee_type ?? "percentage"}
                onChange={(e) => set("fee_type", e.target.value as ManagementFeeType)}
              >
                {FEE_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {t(`feeTypes.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            {form.fee_type === "fixed" ? (
              <div className="field" style={{ flex: 1 }}>
                <label>{t("feeFixedAmount")} (SAR)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.fee_fixed_amount ?? 0}
                  onChange={(e) => set("fee_fixed_amount", Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="field" style={{ flex: 1 }}>
                <label>{t("feePercentage")} (%)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={form.fee_percentage ?? 0}
                  onChange={(e) => set("fee_percentage", Number(e.target.value))}
                />
              </div>
            )}
            <div className="field" style={{ flex: 1 }}>
              <label>{t("vatRate")} (%)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.vat_rate ?? 15}
                onChange={(e) => set("vat_rate", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>{t("feeCollection")}</label>
              <select
                className="select"
                value={form.fee_collection_method ?? "deduct_from_rent"}
                onChange={(e) =>
                  set("fee_collection_method", e.target.value as ManagementFeeCollection)
                }
              >
                {FEE_COLLECTION.map((f) => (
                  <option key={f} value={f}>
                    {t(`feeCollections.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>{t("payoutCycle")}</label>
              <select
                className="select"
                value={form.payout_cycle_months ?? 1}
                onChange={(e) => set("payout_cycle_months", Number(e.target.value))}
              >
                {[1, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} {t("months")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              marginTop: 4,
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
              {t("feePreview")}
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>{t("annualRentBase")}</label>
                <div className="input" style={{ background: "var(--color-bg-deep)" }}>
                  {tCurrency("sar")} {formatSAR(annualRentBase, locale)}
                </div>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{t("annualFee")}</label>
                <div className="input" style={{ background: "var(--color-bg-deep)" }}>
                  {tCurrency("sar")} {formatSAR(feePreview.base, locale)}
                </div>
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>
                  {t("vatAmount")} ({form.vat_rate ?? 15}%)
                </label>
                <div className="input" style={{ background: "var(--color-bg-deep)" }}>
                  {tCurrency("sar")} {formatSAR(feePreview.vat, locale)}
                </div>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>{t("totalFee")}</label>
                <div
                  className="input"
                  style={{
                    background: "var(--color-primary-soft)",
                    borderColor: "var(--color-primary)",
                    fontWeight: 600,
                  }}
                >
                  {tCurrency("sar")} {formatSAR(feePreview.total, locale)}
                </div>
              </div>
            </div>
            <div className="text-sec" style={{ fontSize: 11.5, marginTop: 4 }}>
              {t("feePreviewHint")}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionAuthorities")} icon="gavel" defaultOpen>
          <div className="text-sec" style={{ fontSize: 11.5, marginBottom: 8 }}>
            {t("authoritiesHint")}
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_sign_leases ?? true}
                  onChange={(e) => set("can_sign_leases", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canSignLeases")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_collect_rent ?? true}
                  onChange={(e) => set("can_collect_rent", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canCollectRent")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_market_units ?? true}
                  onChange={(e) => set("can_market_units", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canMarketUnits")}
              </label>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_maintain ?? true}
                  onChange={(e) => set("can_maintain", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canMaintain")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_evict ?? false}
                  onChange={(e) => set("can_evict", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canEvict")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.can_pay_utilities ?? false}
                  onChange={(e) => set("can_pay_utilities", e.target.checked)}
                  style={{ marginInlineEnd: 8 }}
                />
                {t("canPayUtilities")}
              </label>
            </div>
          </div>
          {form.can_maintain && (
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>{t("maintenanceLimit")} (SAR)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.maintenance_limit_amount ?? 0}
                  onChange={(e) => set("maintenance_limit_amount", Number(e.target.value))}
                />
                <div className="text-sec" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {t("maintenanceLimitHint")}
                </div>
              </div>
              <div className="field" style={{ flex: 1 }} />
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title={t("sectionAttachments")} icon="folder" defaultOpen={false}>
          <DocumentUploader
            kind="management-contracts"
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

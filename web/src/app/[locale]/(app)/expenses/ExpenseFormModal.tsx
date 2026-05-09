"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BilingualField } from "@/components/BilingualField";
import { Modal } from "@/components/Modal";
import { createExpense, updateExpense, type ExpenseInput } from "@/lib/actions";
import { localized, type Building, type Owner, type Unit } from "@/lib/types";

import type { ExpenseRow } from "./ExpensesClient";

const CATEGORIES: ExpenseInput["category"][] = [
  "maintenance",
  "utilities",
  "insurance",
  "legal",
  "marketing",
  "cleaning",
  "security",
  "government_fees",
  "other",
];

const PAID_BY: ExpenseInput["paid_by"][] = ["company", "owner", "tenant"];

export function ExpenseFormModal({
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
  editing?: ExpenseRow | null;
}) {
  const t = useTranslations("expensesPage");
  const tCommon = useTranslations("common");
  const isEdit = Boolean(editing);

  const [form, setForm] = useState<ExpenseInput>(() =>
    editing
      ? {
          owner_id: editing.owner_id,
          building_id: editing.building_id,
          unit_id: editing.unit_id,
          category: editing.category as ExpenseInput["category"],
          description: editing.description,
          description_en: editing.description_en ?? "",
          description_ar: editing.description_ar ?? "",
          amount: editing.amount,
          expense_date: editing.expense_date,
          paid_by: editing.paid_by,
          vendor_name: editing.vendor_name ?? "",
          receipt_number: editing.receipt_number ?? "",
          notes: editing.notes ?? "",
        }
      : {
          owner_id: null,
          building_id: null,
          unit_id: null,
          category: "maintenance",
          description: "",
          description_en: "",
          description_ar: "",
          amount: 0,
          expense_date: new Date().toISOString().slice(0, 10),
          paid_by: "company",
          vendor_name: "",
          receipt_number: "",
          notes: "",
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const buildingsForOwner = form.owner_id
    ? buildings.filter((b) => b.owner_id === form.owner_id)
    : buildings;
  const unitsForBuilding = form.building_id
    ? units.filter((u) => u.building_id === form.building_id)
    : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const descEn = form.description_en?.toString().trim() ?? "";
    const descAr = form.description_ar?.toString().trim() ?? "";
    const description = descEn || descAr;
    if (!description) return setError(t("descriptionRequired"));
    if (!form.amount || form.amount <= 0) return setError(t("amountRequired"));
    const payload: ExpenseInput = {
      ...form,
      description,
      description_en: descEn || null,
      description_ar: descAr || null,
      vendor_name: form.vendor_name?.toString().trim() || null,
      receipt_number: form.receipt_number?.toString().trim() || null,
      notes: form.notes?.toString().trim() || null,
      amount: Number(form.amount),
    };
    start(async () => {
      const res = isEdit && editing
        ? await updateExpense(editing.id, payload)
        : await createExpense(payload);
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
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="expense-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : tCommon("save")}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("category")}</label>
            <select
              className="select"
              value={form.category}
              onChange={(e) => set("category", e.target.value as ExpenseInput["category"])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("date")}</label>
            <input
              className="input"
              type="date"
              value={form.expense_date}
              onChange={(e) => set("expense_date", e.target.value)}
              required
            />
          </div>
        </div>
        <BilingualField
          label={t("description")}
          required
          maxLength={300}
          valueEn={form.description_en ?? ""}
          valueAr={form.description_ar ?? ""}
          onChangeEn={(v) => set("description_en", v)}
          onChangeAr={(v) => set("description_ar", v)}
        />
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>
              {t("amount")} <span className="req">*</span>
            </label>
            <input
              className="input"
              type="number"
              min={1}
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", Number(e.target.value))}
              required
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("paidBy")}</label>
            <select
              className="select"
              value={form.paid_by}
              onChange={(e) => set("paid_by", e.target.value as ExpenseInput["paid_by"])}
            >
              {PAID_BY.map((p) => (
                <option key={p} value={p}>
                  {t(`paidByValues.${p}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("owner")}</label>
            <select
              className="select"
              value={form.owner_id ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setForm((f) => ({ ...f, owner_id: v, building_id: null, unit_id: null }));
              }}
            >
              <option value="">{t("scopeAll")}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {localized(o, "name", locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("building")}</label>
            <select
              className="select"
              value={form.building_id ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setForm((f) => ({ ...f, building_id: v, unit_id: null }));
              }}
            >
              <option value="">{t("scopeAll")}</option>
              {buildingsForOwner.map((b) => (
                <option key={b.id} value={b.id}>
                  {localized(b, "name", locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("unit")}</label>
            <select
              className="select"
              value={form.unit_id ?? ""}
              onChange={(e) => set("unit_id", e.target.value ? Number(e.target.value) : null)}
              disabled={!form.building_id}
            >
              <option value="">{t("scopeAll")}</option>
              {unitsForBuilding.map((u) => (
                <option key={u.id} value={u.id}>
                  #{u.number} · {localized(u, "name", locale)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("vendor")}</label>
            <input
              className="input"
              value={form.vendor_name ?? ""}
              onChange={(e) => set("vendor_name", e.target.value)}
              maxLength={150}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("receiptNumber")}</label>
            <input
              className="input input-mono"
              value={form.receipt_number ?? ""}
              onChange={(e) => set("receipt_number", e.target.value)}
              maxLength={50}
              dir="ltr"
            />
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

"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { deleteExpense } from "@/lib/actions";
import { formatSAR } from "@/lib/format";
import { localized, type Building, type Owner, type Unit } from "@/lib/types";

import { ExpenseFormModal } from "./ExpenseFormModal";

export type ExpenseRow = {
  id: number;
  owner_id: number | null;
  building_id: number | null;
  unit_id: number | null;
  category: string;
  description: string;
  description_en: string | null;
  description_ar: string | null;
  amount: number;
  expense_date: string;
  paid_by: "company" | "owner" | "tenant";
  vendor_name: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
};

type CategoryFilter = "all" | string;

export function ExpensesClient({
  expenses,
  owners,
  buildings,
  units,
  locale,
}: {
  expenses: ExpenseRow[];
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  locale: string;
}) {
  const t = useTranslations("expensesPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<ExpenseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ownerOf = (id: number | null) =>
    id == null ? null : owners.find((o) => o.id === id) ?? null;
  const buildingOf = (id: number | null) =>
    id == null ? null : buildings.find((b) => b.id === id) ?? null;
  const unitOf = (id: number | null) =>
    id == null ? null : units.find((u) => u.id === id) ?? null;

  const filtered = expenses.filter((e) => {
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const o = ownerOf(e.owner_id);
    const b = buildingOf(e.building_id);
    const haystack = [
      e.description,
      e.description_en,
      e.description_ar,
      e.vendor_name,
      e.receipt_number,
      o?.name,
      b?.name,
      b?.name_en,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const totals = {
    total: expenses.length,
    sum: expenses.reduce((s, e) => s + e.amount, 0),
    monthSum: expenses
      .filter((e) => e.expense_date.slice(0, 7) === new Date().toISOString().slice(0, 7))
      .reduce((s, e) => s + e.amount, 0),
    companyPaid: expenses
      .filter((e) => e.paid_by === "company")
      .reduce((s, e) => s + e.amount, 0),
  };

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));

  const doDelete = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setError(null);
    start(async () => {
      const res = await deleteExpense(target.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  const categories = Array.from(new Set(expenses.map((e) => e.category)));

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <span className="ms">add</span> {t("newExpense")}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi icon="receipt_long" label={t("total")} value={String(totals.total)} />
        <Kpi
          icon="payments"
          label={t("totalAmount")}
          value={`${tCurrency("sar")} ${formatSAR(totals.sum, locale)}`}
        />
        <Kpi
          icon="calendar_month"
          label={t("thisMonth")}
          value={`${tCurrency("sar")} ${formatSAR(totals.monthSum, locale)}`}
        />
        <Kpi
          icon="business"
          label={t("companyPaid")}
          value={`${tCurrency("sar")} ${formatSAR(totals.companyPaid, locale)}`}
        />
      </div>

      <div className="filter-bar">
        <div className="search-input">
          <span className="ms">search</span>
          <input
            placeholder={tCommon("search") + "…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ height: 36, maxWidth: 220 }}
        >
          <option value="all">{tCommon("all")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card card-tight">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("category")}</th>
                <th>{t("description")}</th>
                <th>{t("scope")}</th>
                <th>{t("vendor")}</th>
                <th>{t("paidBy")}</th>
                <th className="num">{t("amount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const o = ownerOf(e.owner_id);
                const b = buildingOf(e.building_id);
                const u = unitOf(e.unit_id);
                const scope = u
                  ? `${b ? localized(b, "name", locale) : ""} · #${u.number}`
                  : b
                    ? localized(b, "name", locale)
                    : o
                      ? localized(o, "name", locale)
                      : t("scopeAll");
                return (
                  <tr key={e.id}>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {fmtDate(e.expense_date)}
                    </td>
                    <td>
                      <span className="badge">{e.category}</span>
                    </td>
                    <td>{localized(e, "description", locale) || e.description}</td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {scope}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {e.vendor_name ?? "—"}
                    </td>
                    <td>
                      <span className="badge">{t(`paidByValues.${e.paid_by}`)}</span>
                    </td>
                    <td className="num mono" style={{ fontSize: 12 }}>
                      {formatSAR(e.amount, locale)}
                    </td>
                    <td>
                      <div className="actions" style={{ display: "flex", gap: 4 }}>
                        <button
                          className="icon-btn"
                          title={tCommon("edit")}
                          onClick={() => {
                            setEditing(e);
                            setFormOpen(true);
                          }}
                        >
                          <span className="ms ms-sm">edit</span>
                        </button>
                        <button
                          className="icon-btn"
                          title={tCommon("delete")}
                          onClick={() => setConfirmDel(e)}
                        >
                          <span className="ms ms-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>
                    {tCommon("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ExpenseFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          owners={owners}
          buildings={buildings}
          units={units}
          locale={locale}
          editing={editing}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => {
          setConfirmDel(null);
          setError(null);
        }}
        onConfirm={doDelete}
        title={t("deleteTitle")}
        message={error ?? t("deleteMessage", { description: confirmDel?.description ?? "" })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  variant,
}: {
  icon: string;
  label: string;
  value: string;
  variant?: "success" | "warning" | "danger";
}) {
  return (
    <div className={"kpi" + (variant ? ` ${variant}` : "")}>
      <div className="kpi-head">
        <div className="kpi-icon">
          <span className="ms">{icon}</span>
        </div>
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

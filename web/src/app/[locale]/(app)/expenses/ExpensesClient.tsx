"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
  FilterSelect,
} from "@/components/EntityFilterBar";
import { usePermissions } from "@/components/PermissionsProvider";
import { deleteExpense } from "@/lib/actions";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { formatDate, formatSAR } from "@/lib/format";
import { clearQuery, useQuery } from "@/lib/use-query";
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
  workOrders = {},
}: {
  expenses: ExpenseRow[];
  owners: Owner[];
  buildings: Building[];
  units: Unit[];
  locale: string;
  /** expense id → work order that posted it */
  workOrders?: Record<number, { id: number; number: string }>;
}) {
  const t = useTranslations("expensesPage");
  const tCommon = useTranslations("common");
  const tCurrency = useTranslations("currency");
  const { can } = usePermissions();
  const canCreate = can("expenses", "create");
  const canDelete = can("expenses", "delete");
  const canEdit = can("expenses", "edit");
  const ar = locale === "ar";
  const L = (en: string, a: string) => (ar ? a : en);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<ExpenseRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Deep links: ?building= ?owner= ?unit= ?category= ?q=
  const qp = useQuery();
  const [scope, setScope] = useState<{ key: "building" | "owner" | "unit"; id: number } | null>(null);
  useEffect(() => {
    for (const key of ["building", "owner", "unit"] as const) {
      const id = Number(qp[key]);
      if (id) { setScope({ key, id }); break; }
    }
    if (qp.category) setCategoryFilter(qp.category);
    if (qp.q) setSearch(qp.q);
  }, [qp]);

  const ownerOf = (id: number | null) =>
    id == null ? null : owners.find((o) => o.id === id) ?? null;
  const buildingOf = (id: number | null) =>
    id == null ? null : buildings.find((b) => b.id === id) ?? null;
  const unitOf = (id: number | null) =>
    id == null ? null : units.find((u) => u.id === id) ?? null;

  const inScope = (e: ExpenseRow) => {
    if (!scope) return true;
    if (scope.key === "unit") return e.unit_id === scope.id;
    if (scope.key === "building") return e.building_id === scope.id || (e.unit_id != null && unitOf(e.unit_id)?.building_id === scope.id);
    const b = e.building_id != null ? buildingOf(e.building_id) : null;
    return e.owner_id === scope.id || b?.owner_id === scope.id;
  };
  const scopeLabel = !scope ? "" : scope.key === "owner"
    ? `${L("Owner", "المالك")}: ${(() => { const o = ownerOf(scope.id); return o ? localized(o, "name", locale) : scope.id; })()}`
    : scope.key === "building"
      ? `${L("Property", "العقار")}: ${(() => { const b = buildingOf(scope.id); return b ? localized(b, "name", locale) : scope.id; })()}`
      : `${L("Unit", "الوحدة")} ${unitOf(scope.id)?.number ?? scope.id}`;
  const scopedRows = expenses.filter(inScope);

  const filtered = scopedRows.filter((e) => {
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
    total: scopedRows.length,
    sum: scopedRows.reduce((s, e) => s + e.amount, 0),
    monthSum: scopedRows
      .filter((e) => e.expense_date.slice(0, 7) === new Date().toISOString().slice(0, 7))
      .reduce((s, e) => s + e.amount, 0),
    companyPaid: scopedRows
      .filter((e) => e.paid_by === "company")
      .reduce((s, e) => s + e.amount, 0),
  };

  const fmtDate = (iso: string) => formatDate(iso, locale);

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
  const filtersActive = categoryFilter !== "all" || search.trim() !== "" || scope != null;
  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setScope(null);
    clearQuery(["building", "owner", "unit", "category", "q"]);
  };

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div className="xl-links">
          {can("payments", "view") && (
            <Link className="btn btn-secondary" href={`/${locale}/payments${scope ? `?${scope.key}=${scope.id}` : ""}`}>
              <span className="ms ms-sm">payments</span>{L("Payments", "الدفعات")}
            </Link>
          )}
          {can("maintenance", "view") && (
            <Link className="btn btn-secondary" href={`/${locale}/maintenance`}>
              <span className="ms ms-sm">handyman</span>{L("Work orders", "أوامر الصيانة")}
            </Link>
          )}
          {canCreate && (
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <span className="ms">add</span> {t("newExpense")}
          </button>
          )}
        </div>
      </div>

      {scope && (
        <div className="xl-scope" role="status">
          <span className="ms ms-sm" aria-hidden>filter_alt</span>
          <span>{L("Showing expenses for", "تعرض مصروفات")} <b>{scopeLabel}</b></span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setScope(null); clearQuery(["building", "owner", "unit"]); }}>{L("Show all expenses", "عرض كل المصروفات")}</button>
        </div>
      )}

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

      <FilterBar
        trailing={
          <>
            <FilterResultMeta
              showing={filtered.length}
              total={expenses.length}
              label={tCommon("showingResults", { showing: filtered.length, total: expenses.length })}
            />
            {filtersActive && (
              <FilterClearButton label={tCommon("clearFilters")} onClick={clearFilters} />
            )}
          </>
        }
        search={
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder={tCommon("search") + "…"}
          />
        }
      >
        <FilterSelect
          label={t("category")}
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "all", label: tCommon("all") },
            ...EXPENSE_CATEGORIES.map((c) => ({
              value: c,
              label: t(`categories.${c}`),
            })),
            ...categories
              .filter((c) => !EXPENSE_CATEGORIES.includes(c as typeof EXPENSE_CATEGORIES[number]))
              .map((c) => ({ value: c, label: c })),
          ]}
          maxWidth={240}
        />
      </FilterBar>

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
                const rowScope = u
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
                      <span className="badge">{t(`categories.${e.category}`)}</span>
                    </td>
                    <td>
                      {localized(e, "description", locale) || e.description}
                      {workOrders[e.id] && (
                        <div><Link className="xl-a xl-a--sub" href={`/${locale}/maintenance?open=${workOrders[e.id].id}`}><span className="ms ms-sm" aria-hidden>handyman</span>{L("Work order", "أمر الصيانة")} {workOrders[e.id].number}</Link></div>
                      )}
                    </td>
                    <td className="text-sec" style={{ fontSize: 12 }}>
                      {b ? <Link className="xl-a xl-a--sub" href={`/${locale}/properties/${b.id}`}>{rowScope}</Link> : o ? <Link className="xl-a xl-a--sub" href={`/${locale}/owners/${o.id}`}>{rowScope}</Link> : rowScope}
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
                        {canEdit && (
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
                        )}
                        {canDelete && (
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(e)}
                          >
                            <span className="ms ms-sm">delete</span>
                          </button>
                        )}
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

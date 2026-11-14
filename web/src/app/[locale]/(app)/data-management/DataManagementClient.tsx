"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/Modal";

export type DataSummary = {
  sheets: {
    sheet: string;
    group?: string;
    title: string;
    title_en: string;
    title_ar: string;
    reference_only: boolean;
    count: number;
    columns: number;
    refs?: string[];
  }[];
  lookups: { key: string; label_en: string; label_ar: string; count: number }[];
};

type ImportError = {
  sheet: string | null;
  sheet_title: string | null;
  sheet_ar: string | null;
  row: number | null;
  column: string | null;
  column_en: string | null;
  column_ar: string | null;
  value: string | number | boolean | null;
  message_en: string;
  message_ar: string;
};

type SheetResult = {
  sheet: string;
  title: string;
  title_ar: string;
  rows: number;
  create: number;
  update: number;
  unchanged: number;
  invalid_rows: number;
  errors: number;
};

type ImportReport = {
  ok: boolean;
  applied: boolean;
  error_count: number;
  truncated: boolean;
  errors: ImportError[];
  summary: SheetResult[];
};

type Phase = "idle" | "validating" | "validated" | "applying" | "applied";

const SHEET_ICON: Record<string, string> = {
  users: "badge",
  agents: "support_agent",
  owners: "group",
  management_companies: "apartment",
  employees: "engineering",
  buildings: "domain",
  units: "door_front",
  tenants: "person",
  tenant_companions: "family_restroom",
  management_contracts: "handshake",
  management_contract_properties: "home_work",
  contracts: "description",
  payments: "payments",
  payment_splits: "call_split",
  expenses: "receipt_long",
  hr_companies: "corporate_fare",
  hr_departments: "account_tree",
  hr_profiles: "badge",
  hr_personal: "id_card",
  hr_family_members: "family_restroom",
  hr_contract_templates: "article",
  hr_contracts: "contract",
  collection_actions: "phone_in_talk",
  hr_assets: "devices",
  hr_requests: "event_note",
  hr_attendance: "schedule",
  work_orders: "construction",
  lease_renewals: "autorenew",
};

const GROUPS: { key: string; ar: string; en: string; icon: string }[] = [
  { key: "organisation", ar: "المنشأة والمستخدمون", en: "Organisation & users", icon: "apartment" },
  { key: "property", ar: "العقارات والعقود", en: "Properties & leases", icon: "domain" },
  { key: "finance", ar: "المالية", en: "Finance", icon: "payments" },
  { key: "operations", ar: "التشغيل", en: "Operations", icon: "construction" },
  { key: "hr", ar: "الموارد البشرية (نظام المجموعة)", en: "HR (group ERP)", icon: "groups" },
];

export function DataManagementClient({ summary, locale }: { summary: DataSummary; locale: string }) {
  const t = useTranslations("dataManagement");
  const tc = useTranslations("common");
  const router = useRouter();
  const ar = locale === "ar";
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sheetFilter, setSheetFilter] = useState<string>("");
  const [query, setQuery] = useState("");

  const totalRecords = summary.sheets.filter((s) => !s.reference_only).reduce((a, s) => a + s.count, 0);
  const editable = summary.sheets.filter((s) => !s.reference_only);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const linked = useMemo(() => {
    const out = new Set<string>();
    for (const k of picked) for (const r of summary.sheets.find((s) => s.sheet === k)?.refs ?? []) if (!picked.has(r) && !summary.sheets.find((s) => s.sheet === r)?.reference_only) out.add(r);
    return [...out];
  }, [picked, summary.sheets]);
  const pickedRecords = editable.filter((s) => picked.has(s.sheet)).reduce((a, s) => a + s.count, 0);
  const sel = [...picked].join(",");
  const titleOf = (k: string) => { const s = summary.sheets.find((x) => x.sheet === k); return s ? (ar ? s.title_ar : s.title_en) : k; };
  const changes = report?.summary.reduce((a, s) => a + s.create + s.update, 0) ?? 0;

  function reset(next: File | null) {
    setFile(next);
    setReport(null);
    setFatal(null);
    setPhase("idle");
    setSheetFilter("");
    setQuery("");
  }

  async function send(action: "validate" | "apply") {
    if (!file) return;
    setFatal(null);
    setPhase(action === "validate" ? "validating" : "applying");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/data-io/${action}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (body && Array.isArray(body.errors)) {
        setReport(body as ImportReport);
        if (action === "apply" && res.ok && body.applied) {
          setPhase("applied");
          router.refresh();
          return;
        }
        setPhase("validated");
        return;
      }
      setFatal(typeof body?.detail === "string" ? body.detail : t("unexpectedError", { status: res.status }));
      setPhase(report ? "validated" : "idle");
    } catch {
      setFatal(t("networkError"));
      setPhase(report ? "validated" : "idle");
    }
  }

  const filteredErrors = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return report.errors.filter((e) => {
      if (sheetFilter && e.sheet !== sheetFilter) return false;
      if (!q) return true;
      return [e.column, e.column_en, e.column_ar, String(e.value ?? ""), e.message_en, e.message_ar, String(e.row ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [report, sheetFilter, query]);

  const errorSheets = useMemo(() => {
    const seen = new Map<string, string>();
    report?.errors.forEach((e) => {
      if (e.sheet) seen.set(e.sheet, (ar ? e.sheet_ar : e.sheet_title) ?? e.sheet);
    });
    return [...seen.entries()];
  }, [report, ar]);

  function downloadErrorsCsv() {
    if (!report) return;
    const header = ["sheet", "row", "column", "column_label", "value", "message_en", "message_ar"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = report.errors.map((e) =>
      [e.sheet_title ?? "", e.row ?? "", e.column ?? "", ar ? e.column_ar : e.column_en, e.value, e.message_en, e.message_ar]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(file?.name ?? "import").replace(/\.xlsx$/i, "")}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const busy = phase === "validating" || phase === "applying";

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
      </div>

      {/* ── Export ─────────────────────────────────────────────────────── */}
      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 640 }}>
            <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ms">download</span> {t("exportTitle")}
            </h3>
            <p className="text-sec" style={{ fontSize: 13, margin: "6px 0 0" }}>
              {t("exportHelp", { records: totalRecords.toLocaleString(locale) })}
            </p>
          </div>
        </div>

        <div className="dm-pickbar">
          <span>{ar ? `اختر ما تريد تصديره — ${picked.size} من ${editable.length}` : `Choose what to export — ${picked.size} of ${editable.length}`}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPicked(new Set(editable.map((s) => s.sheet)))}>{ar ? "تحديد الكل" : "Select all"}</button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={!picked.size} onClick={() => setPicked(new Set())}>{ar ? "إلغاء التحديد" : "Clear"}</button>
        </div>

        {GROUPS.filter((g) => summary.sheets.some((s) => (s.group ?? "property") === g.key)).map((g) => {
          const inGroup = summary.sheets.filter((s) => (s.group ?? "property") === g.key);
          const pickable = inGroup.filter((s) => !s.reference_only).map((s) => s.sheet);
          const allOn = pickable.length > 0 && pickable.every((k) => picked.has(k));
          return (
        <div key={g.key} className="dm-group">
        <h4 className="dm-group__h">
          <span className="ms ms-sm" aria-hidden>{g.icon}</span>
          {ar ? g.ar : g.en}
          <span className="text-sec">· {inGroup.reduce((n, s) => n + s.count, 0).toLocaleString(locale)}</span>
          {pickable.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm dm-group__all" onClick={() => setPicked((o) => { const n = new Set(o); pickable.forEach((k) => (allOn ? n.delete(k) : n.add(k))); return n; })}>
              {allOn ? (ar ? "إلغاء القسم" : "Clear group") : (ar ? "تحديد القسم" : "Select group")}
            </button>
          )}
        </h4>
        <div className="dm-sheets" role="group" aria-label={ar ? g.ar : g.en}>
          {inGroup.map((s) => {
            const on = picked.has(s.sheet);
            const isLinked = linked.includes(s.sheet);
            return (
              <label key={s.sheet} className={`dm-sheet${on ? " is-on" : ""}${isLinked ? " is-linked" : ""}${s.reference_only ? " is-ref" : ""}`}>
                {!s.reference_only && <input type="checkbox" checked={on} onChange={() => togglePick(s.sheet)} />}
                <span className="ms" aria-hidden>{SHEET_ICON[s.sheet] ?? "table"}</span>
                <span className="dm-sheet__txt">
                  <b>{ar ? s.title_ar : s.title_en}</b>
                  <small>{s.reference_only ? t("referenceOnly") : isLinked ? (ar ? "تُضاف كمرجع مقفل" : "added as locked reference") : t("columnsCount", { n: s.columns })}</small>
                </span>
                <span className="mono dm-sheet__n">{s.count.toLocaleString(locale)}</span>
              </label>
            );
          })}
        </div>
        </div>
          );
        })}

        <div className="dm-exportbar">
          <div className="text-sec">
            {picked.size === 0
              ? (ar ? "لم تختر شيئًا بعد. اختر الأوراق التي تحتاجها، أو صدّر كل البيانات." : "Nothing selected yet. Pick the sheets you need, or export everything.")
              : (ar ? `${pickedRecords.toLocaleString(locale)} سجل في ${picked.size} ورقة.` : `${pickedRecords.toLocaleString(locale)} records in ${picked.size} sheet(s).`)}
            {linked.length > 0 && <div>{ar ? `للربط تُضاف للاطلاع فقط (مقفلة ولا تُستورد): ${linked.map(titleOf).join("، ")}` : `For link look-ups, these are added read-only (locked, not imported): ${linked.map(titleOf).join(", ")}`}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className={`btn btn-primary${picked.size ? "" : " is-disabled"}`} aria-disabled={!picked.size} href={picked.size ? `/api/data-io/export?sheets=${sel}` : undefined} download onClick={(e) => { if (!picked.size) e.preventDefault(); }}>
              <span className="ms">table_view</span> {ar ? `تصدير المحدد (${picked.size})` : `Export selected (${picked.size})`}
            </a>
            <a className={`btn btn-secondary${picked.size ? "" : " is-disabled"}`} aria-disabled={!picked.size} href={picked.size ? `/api/data-io/export?template=1&sheets=${sel}` : undefined} download onClick={(e) => { if (!picked.size) e.preventDefault(); }}>
              <span className="ms">draft</span> {ar ? "قالب فارغ للمحدد" : "Empty template for selected"}
            </a>
            <a className="btn btn-ghost" href="/api/data-io/export" download>
              <span className="ms">download</span> {t("exportAll")}
            </a>
          </div>
        </div>
        <div className="text-sec" style={{ fontSize: 12, marginTop: 10 }}>
          {t("lookupsIncluded", { n: summary.lookups.length })}
        </div>
      </section>

      {/* ── Import ─────────────────────────────────────────────────────── */}
      <section className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ms">upload</span> {t("importTitle")}
        </h3>
        <ol className="text-sec" style={{ fontSize: 13, margin: "8px 0 16px", paddingInlineStart: 18, lineHeight: 1.7 }}>
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            onChange={(e) => reset(e.target.files?.[0] ?? null)}
          />
          <button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <span className="ms">attach_file</span> {file ? t("changeFile") : t("chooseFile")}
          </button>
          {file && (
            <span className="mono text-sec" style={{ fontSize: 12.5 }}>
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" disabled={!file || busy} onClick={() => send("validate")}>
            <span className="ms">fact_check</span> {phase === "validating" ? t("validating") : t("validate")}
          </button>
          <button
            className="btn btn-primary"
            disabled={!report?.ok || phase !== "validated" || changes === 0 || busy}
            onClick={() => setConfirmOpen(true)}
            title={report && !report.ok ? t("fixErrorsFirst") : undefined}
          >
            <span className="ms">publish</span> {phase === "applying" ? t("applying") : t("apply")}
          </button>
        </div>

        {fatal && (
          <div className="badge badge-danger" style={{ display: "block", marginTop: 14, padding: "10px 12px", whiteSpace: "normal" }}>
            {fatal}
          </div>
        )}

        {report && (
          <div style={{ marginTop: 18 }}>
            <StatusBanner report={report} phase={phase} changes={changes} t={t} />

            {report.summary.length > 0 && (
              <div className="tbl-wrap" style={{ marginTop: 14 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t("colSheet")}</th>
                      <th style={{ textAlign: "end" }}>{t("colRows")}</th>
                      <th style={{ textAlign: "end" }}>{t("colNew")}</th>
                      <th style={{ textAlign: "end" }}>{t("colUpdated")}</th>
                      <th style={{ textAlign: "end" }}>{t("colUnchanged")}</th>
                      <th style={{ textAlign: "end" }}>{t("colInvalid")}</th>
                      <th style={{ textAlign: "end" }}>{t("colErrors")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.summary.map((s) => (
                      <tr key={s.sheet}>
                        <td>{ar ? s.title_ar : s.title}</td>
                        <td className="mono" style={{ textAlign: "end" }}>{s.rows}</td>
                        <td className="mono" style={{ textAlign: "end", color: s.create ? "var(--color-success)" : undefined }}>{s.create}</td>
                        <td className="mono" style={{ textAlign: "end", color: s.update ? "var(--color-primary)" : undefined }}>{s.update}</td>
                        <td className="mono text-sec" style={{ textAlign: "end" }}>{s.unchanged}</td>
                        <td className="mono" style={{ textAlign: "end", color: s.invalid_rows ? "var(--color-danger)" : undefined }}>{s.invalid_rows}</td>
                        <td className="mono" style={{ textAlign: "end", color: s.errors ? "var(--color-danger)" : undefined, fontWeight: s.errors ? 600 : undefined }}>
                          {s.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report.error_count > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 14 }}>
                    {t("errorsTitle", { n: report.error_count.toLocaleString(locale) })}
                  </h4>
                  <div style={{ flex: 1 }} />
                  <select className="select" value={sheetFilter} onChange={(e) => setSheetFilter(e.target.value)} style={{ width: "auto" }}>
                    <option value="">{t("allSheets")}</option>
                    {errorSheets.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder={tc("search")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ width: 200 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={downloadErrorsCsv}>
                    <span className="ms ms-sm">download</span> {t("downloadErrors")}
                  </button>
                </div>
                {report.truncated && (
                  <div className="text-sec" style={{ fontSize: 12, marginBottom: 8 }}>{t("truncated", { n: report.errors.length })}</div>
                )}
                <div className="tbl-wrap" style={{ maxHeight: 520, overflow: "auto" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{t("colSheet")}</th>
                        <th>{t("colRow")}</th>
                        <th>{t("colColumn")}</th>
                        <th>{t("colValue")}</th>
                        <th>{t("colProblem")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredErrors.slice(0, 1000).map((e, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: "nowrap" }}>{(ar ? e.sheet_ar : e.sheet_title) ?? "—"}</td>
                          <td className="mono">{e.row ?? "—"}</td>
                          <td>
                            {(ar ? e.column_ar : e.column_en) ?? e.column ?? "—"}
                            {e.column && <div className="mono text-sec" style={{ fontSize: 10.5 }}>{e.column}</div>}
                          </td>
                          <td className="mono" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.value === null || e.value === "" ? <span className="text-sec">{t("empty")}</span> : String(e.value)}
                          </td>
                          <td style={{ color: "var(--color-danger)" }}>{ar ? e.message_ar : e.message_en}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredErrors.length > 1000 && (
                  <div className="text-sec" style={{ fontSize: 12, marginTop: 8 }}>{t("showingFirst", { n: 1000 })}</div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          send("apply");
        }}
        title={t("confirmTitle")}
        message={t("confirmMessage", { n: changes })}
        confirmLabel={t("apply")}
        cancelLabel={tc("cancel")}
      />
    </div>
  );
}

function StatusBanner({
  report,
  phase,
  changes,
  t,
}: {
  report: ImportReport;
  phase: Phase;
  changes: number;
  t: ReturnType<typeof useTranslations>;
}) {
  let variant: "success" | "danger" | "neutral";
  let icon: string;
  let text: string;
  if (phase === "applied") {
    variant = "success";
    icon = "task_alt";
    text = t("appliedOk", { n: changes });
  } else if (!report.ok) {
    variant = "danger";
    icon = "error";
    text = t("hasErrors", { n: report.error_count });
  } else if (changes === 0) {
    variant = "neutral";
    icon = "info";
    text = t("noChanges");
  } else {
    variant = "success";
    icon = "verified";
    text = t("readyToApply", { n: changes });
  }
  const color =
    variant === "success" ? "var(--color-success)" : variant === "danger" ? "var(--color-danger)" : "var(--color-text-secondary)";
  const bg =
    variant === "success" ? "var(--color-success-soft)" : variant === "danger" ? "var(--color-danger-soft)" : "var(--color-primary-softer)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background: bg,
        color,
        fontWeight: 600,
        fontSize: 13.5,
      }}
    >
      <span className="ms">{icon}</span>
      {text}
    </div>
  );
}

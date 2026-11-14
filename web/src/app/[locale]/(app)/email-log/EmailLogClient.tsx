"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { getEmailLog } from "@/lib/account-actions";
import { formatDateTime } from "@/lib/format";

export type EmailLogRow = {
  id: number;
  created_at: string;
  category: string;
  to_email: string;
  cc_emails: string | null;
  subject: string;
  status: "sent" | "failed" | "console";
  error: string | null;
};
export type EmailLogDetail = EmailLogRow & { text_body: string | null; html_body: string | null };
export type EmailLogPage = {
  items: EmailLogRow[];
  total: number;
  sent: number;
  failed: number;
  console: number;
  categories: string[];
};

const STATUS_BADGE = { sent: "badge-success", failed: "badge-danger", console: "badge-neutral" } as const;

export function EmailLogClient({
  data,
  locale,
  filters,
  page,
  limit,
}: {
  data: EmailLogPage;
  locale: string;
  filters: { q: string; status: string; category: string; days: string };
  page: number;
  limit: number;
}) {
  const t = useTranslations("emailLog");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState<EmailLogDetail | null>(null);
  const [view, setView] = useState<"html" | "text">("html");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [, start] = useTransition();

  const go = (patch: Partial<typeof filters> & { page?: number }) => {
    const next = { ...filters, ...patch };
    const qs = new URLSearchParams();
    if (next.q) qs.set("q", next.q);
    if (next.status) qs.set("status", next.status);
    if (next.category) qs.set("category", next.category);
    if (next.days !== "30") qs.set("days", next.days);
    if (patch.page && patch.page > 1) qs.set("page", String(patch.page));
    start(() => router.push(`${pathname}${qs.size ? `?${qs}` : ""}`));
  };

  const openRow = async (id: number) => {
    setLoadingId(id);
    const res = await getEmailLog(id);
    setLoadingId(null);
    if (res.ok) {
      setView(res.data.html_body ? "html" : "text");
      setOpen(res.data);
    }
  };

  const catLabel = (c: string) => (t.has(`category.${c}` as never) ? t(`category.${c}` as never) : c);
  const reasonLabel = (r: string | null) =>
    r ? (t.has(`reason.${r}` as never) ? t(`reason.${r}` as never) : r) : "";
  const pages = Math.max(1, Math.ceil(data.total / limit));
  const windowTotal = data.sent + data.failed + data.console;

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {(
          [
            ["", "mail", t("kpiAll"), windowTotal, undefined],
            ["sent", "mark_email_read", t("kpiSent"), data.sent, "success"],
            ["failed", "error", t("kpiFailed"), data.failed, data.failed ? "danger" : undefined],
            ["console", "terminal", t("kpiConsole"), data.console, undefined],
          ] as const
        ).map(([st, icon, label, value, variant]) => (
          <button
            key={label}
            type="button"
            className={"kpi kpi-btn" + (variant ? " " + variant : "") + (filters.status === st ? " is-active" : "")}
            onClick={() => go({ status: st, page: 1 })}
            aria-pressed={filters.status === st}
          >
            <div className="kpi-head">
              <div className="kpi-icon"><span className="ms">{icon}</span></div>
              <div className="kpi-label">{label}</div>
            </div>
            <div className="kpi-value">{value}</div>
          </button>
        ))}
      </div>

      <form
        className="email-log-filters card"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim(), page: 1 });
        }}
      >
        <div className="topbar-search" style={{ flex: 1, minWidth: 220 }}>
          <span className="ms">search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
        </div>
        <select className="select" style={{ width: "auto" }} value={filters.category} onChange={(e) => go({ category: e.target.value, page: 1 })} aria-label={t("categoryLabel")}>
          <option value="">{t("allCategories")}</option>
          {data.categories.map((c) => (
            <option key={c} value={c}>{catLabel(c)}</option>
          ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={filters.days} onChange={(e) => go({ days: e.target.value, page: 1 })} aria-label={t("periodLabel")}>
          {["1", "7", "30", "90", "365"].map((d) => (
            <option key={d} value={d}>{t("lastDays", { days: Number(d) })}</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">{t("search")}</button>
      </form>

      {data.items.length === 0 ? (
        <div className="card support-empty">
          <span className="ms" style={{ fontSize: 40, color: "var(--color-text-tertiary)" }}>mail</span>
          <div className="text-sec">{t("empty")}</div>
        </div>
      ) : (
        <div className="card card-tight" style={{ overflowX: "auto" }}>
          <table className="email-log-table">
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("categoryLabel")}</th>
                <th>{t("recipient")}</th>
                <th>{t("subject")}</th>
                <th>{t("status")}</th>
                <th aria-label={t("view")} />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} onClick={() => openRow(r.id)} className="clickable">
                  <td className="mono nowrap">{formatDateTime(r.created_at, locale)}</td>
                  <td><span className="badge badge-neutral">{catLabel(r.category)}</span></td>
                  <td>
                    <div className="mono" dir="ltr">{r.to_email}</div>
                    {r.cc_emails && <div className="text-sec mono" dir="ltr" style={{ fontSize: 11 }}>Cc: {r.cc_emails}</div>}
                  </td>
                  <td className="email-log-subject">{r.subject}</td>
                  <td>
                    <span className={"badge " + STATUS_BADGE[r.status]}>{t(`statusValue.${r.status}`)}</span>
                    {r.error && <div className="text-sec" style={{ fontSize: 11, marginTop: 3 }}>{reasonLabel(r.error)}</div>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t("view")}
                      onClick={(e) => {
                        e.stopPropagation();
                        openRow(r.id);
                      }}
                    >
                      <span className="ms ms-sm">{loadingId === r.id ? "progress_activity" : "visibility"}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="email-log-pager">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => go({ page: page - 1 })}>
            <span className="ms ms-sm flip-rtl">chevron_left</span> {t("prev")}
          </button>
          <span className="text-sec">{t("pageOf", { page, pages, total: data.total })}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => go({ page: page + 1 })}>
            {t("next")} <span className="ms ms-sm flip-rtl">chevron_right</span>
          </button>
        </div>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.subject ?? ""}
        subtitle={open ? `${formatDateTime(open.created_at, locale)} · ${catLabel(open.category)}` : ""}
        size="lg"
      >
        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <dl className="email-log-meta">
              <dt>{t("recipient")}</dt>
              <dd className="mono" dir="ltr">{open.to_email}</dd>
              {open.cc_emails && (
                <>
                  <dt>Cc</dt>
                  <dd className="mono" dir="ltr">{open.cc_emails}</dd>
                </>
              )}
              <dt>{t("status")}</dt>
              <dd>
                <span className={"badge " + STATUS_BADGE[open.status]}>{t(`statusValue.${open.status}`)}</span>
                {open.error && <span className="text-sec" style={{ marginInlineStart: 8 }}>{reasonLabel(open.error)}</span>}
              </dd>
            </dl>
            <div className="text-sec" style={{ fontSize: 11.5 }}>
              <span className="ms ms-sm" style={{ verticalAlign: "middle" }}>shield</span> {t("redactedNote")}
            </div>
            {open.html_body && open.text_body && (
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={"tab" + (view === "html" ? " active" : "")} onClick={() => setView("html")}>{t("asReceived")}</button>
                <button className={"tab" + (view === "text" ? " active" : "")} onClick={() => setView("text")}>{t("plainText")}</button>
              </div>
            )}
            {view === "html" && open.html_body ? (
              // Sandboxed (no scripts, no same-origin) — it's our own template, but
              // it can contain user-supplied text such as ticket subjects.
              <iframe title={open.subject} className="email-log-frame" sandbox="" srcDoc={open.html_body} />
            ) : (
              <pre className="email-log-text">{open.text_body ?? ""}</pre>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

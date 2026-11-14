"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
} from "@/components/EntityFilterBar";
import { UserAvatar } from "@/components/UserAvatar";
import { formatDateTime } from "@/lib/format";
import { CATEGORY_ICON, PRIORITY_BADGE, STATUS_BADGE } from "@/lib/support-ui";
import type { TicketStats, TicketSummary } from "@/lib/types";

import { NewTicketModal } from "./NewTicketModal";

type Bucket = "active" | "waiting" | "done" | "all";
type Scope = "all" | "assigned" | "mine";

const ACTIVE = new Set(["open", "in_progress", "waiting_user"]);

export function SupportClient({
  tickets,
  stats,
  isStaff,
  meId,
  locale,
  openNew,
}: {
  tickets: TicketSummary[];
  stats: TicketStats;
  isStaff: boolean;
  meId: number;
  locale: string;
  openNew: boolean;
}) {
  const t = useTranslations("support");
  const tCommon = useTranslations("common");
  const [newOpen, setNewOpen] = useState(openNew);
  const [bucket, setBucket] = useState<Bucket>("active");
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((tk) => {
      if (isStaff && scope === "assigned" && tk.assignee?.id !== meId) return false;
      if (isStaff && scope === "mine" && tk.user.id !== meId) return false;
      if (bucket === "active" && !ACTIVE.has(tk.status)) return false;
      if (bucket === "waiting" && !tk.awaiting_me) return false;
      if (bucket === "done" && ACTIVE.has(tk.status)) return false;
      if (!q) return true;
      return (
        tk.subject.toLowerCase().includes(q) ||
        tk.reference.toLowerCase().includes(q) ||
        tk.user.username.toLowerCase().includes(q) ||
        (tk.user.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [tickets, bucket, scope, search, isStaff, meId]);

  const counts = useMemo(
    () => ({
      active: tickets.filter((x) => ACTIVE.has(x.status)).length,
      waiting: tickets.filter((x) => x.awaiting_me).length,
      done: tickets.filter((x) => !ACTIVE.has(x.status)).length,
      all: tickets.length,
    }),
    [tickets],
  );

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{isStaff ? t("staffTitle") : t("title")}</h2>
          <div className="page-subtitle">{isStaff ? t("staffSubtitle") : t("subtitle")}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
          <span className="ms">add</span> {t("newTicket")}
        </button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Kpi icon="inbox" label={t("kpiOpen")} value={stats.open} />
        <Kpi icon="pending" label={t("kpiInProgress")} value={stats.in_progress} />
        <Kpi
          icon="hourglass_top"
          label={isStaff ? t("kpiWaitingUser") : t("kpiWaitingYou")}
          value={stats.waiting_user}
          variant={!isStaff && stats.waiting_user > 0 ? "warning" : undefined}
        />
        <Kpi
          icon={isStaff ? "priority_high" : "task_alt"}
          label={isStaff ? t("kpiUrgent") : t("kpiResolved")}
          value={isStaff ? stats.urgent_open : stats.resolved + stats.closed}
          variant={isStaff ? (stats.urgent_open > 0 ? "danger" : undefined) : "success"}
        />
      </div>

      <div className="support-layout">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
              {(
                [
                  ["active", t("bucketActive")],
                  ["waiting", isStaff ? t("bucketNeedsReply") : t("bucketWaitingYou")],
                  ["done", t("bucketDone")],
                  ["all", tCommon("all")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={bucket === id}
                  className={"tab" + (bucket === id ? " active" : "")}
                  onClick={() => setBucket(id)}
                >
                  {label}
                  <span className="tab-count">{counts[id]}</span>
                </button>
              ))}
            </div>
            {isStaff && (
              <select
                className="select"
                style={{ width: "auto", height: 36 }}
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                aria-label={t("scope")}
              >
                <option value="all">{t("scopeAll")}</option>
                <option value="assigned">{t("scopeAssigned")}</option>
                <option value="mine">{t("scopeMine")}</option>
              </select>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <FilterBar
              trailing={
                <>
                  <FilterResultMeta
                    showing={filtered.length}
                    total={tickets.length}
                    label={tCommon("showingResults", { showing: filtered.length, total: tickets.length })}
                  />
                  {search && <FilterClearButton label={tCommon("clearFilters")} onClick={() => setSearch("")} />}
                </>
              }
              search={
                <FilterSearch value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
              }
            />
          </div>

          {filtered.length === 0 ? (
            <div className="card support-empty">
              <span className="ms" style={{ fontSize: 40, color: "var(--color-text-tertiary)" }}>
                {tickets.length === 0 ? "support_agent" : "search_off"}
              </span>
              <div style={{ fontWeight: 600 }}>{tickets.length === 0 ? t("emptyTitle") : tCommon("noResults")}</div>
              {tickets.length === 0 && (
                <>
                  <div className="text-sec">{t("emptyHint")}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
                    <span className="ms ms-sm">add</span> {t("newTicket")}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="card card-tight">
              <ul className="ticket-list">
                {filtered.map((tk) => (
                  <li key={tk.id}>
                    <Link href={`/${locale}/support/${tk.id}`} className="ticket-row">
                      <span className="ticket-cat ms">{CATEGORY_ICON[tk.category] ?? "help"}</span>
                      <div className="ticket-main">
                        <div className="ticket-subject">
                          {tk.awaiting_me && <span className="ticket-unread" title={t("needsYourReply")} />}
                          {tk.subject}
                        </div>
                        <div className="ticket-meta">
                          <span className="mono">{tk.reference}</span>
                          <span>· {t(`category.${tk.category}`)}</span>
                          {isStaff && (
                            <span className="ticket-requester">
                              · <UserAvatar name={tk.user.full_name || tk.user.username} url={tk.user.avatar_url} size={16} />
                              {tk.user.full_name || tk.user.username}
                            </span>
                          )}
                          <span>· {formatDateTime(tk.updated_at, locale)}</span>
                        </div>
                      </div>
                      <div className="ticket-badges">
                        {tk.priority !== "normal" && (
                          <span className={"badge " + PRIORITY_BADGE[tk.priority]}>{t(`priority.${tk.priority}`)}</span>
                        )}
                        <span className={"badge " + STATUS_BADGE[tk.status]}>
                          {isStaff || tk.status !== "waiting_user" ? t(`status.${tk.status}`) : t("status.waiting_you")}
                        </span>
                        {tk.message_count > 1 && (
                          <span className="text-sec" title={t("messages")}>
                            <span className="ms ms-sm" style={{ verticalAlign: "middle" }}>forum</span> {tk.message_count}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="support-aside">
          <div className="card">
            <div className="card-hd"><h3>{t("contactTitle")}</h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div className="support-contact">
                <span className="ms ms-sm">call</span>
                <a href="tel:920007039" className="mono" dir="ltr">920007039</a>
              </div>
              <div className="support-contact">
                <span className="ms ms-sm">chat</span>
                <a href="https://wa.me/966920007039" target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
              <div className="support-contact">
                <span className="ms ms-sm">schedule</span>
                <span>{t("officeHours")}</span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><h3>{t("selfHelpTitle")}</h3></div>
            <div className="card-body support-links">
              <Link href={`/${locale}/account?tab=security`}><span className="ms ms-sm">key</span> {t("helpPassword")}</Link>
              <Link href={`/${locale}/account`}><span className="ms ms-sm">badge</span> {t("helpProfile")}</Link>
              <Link href={`/${locale}/account?tab=security`}><span className="ms ms-sm">devices</span> {t("helpSessions")}</Link>
              <Link href={`/${locale}/account?tab=preferences`}><span className="ms ms-sm">translate</span> {t("helpLanguage")}</Link>
            </div>
          </div>
        </aside>
      </div>

      <NewTicketModal open={newOpen} onClose={() => setNewOpen(false)} locale={locale} />
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
  value: number;
  variant?: "success" | "warning" | "danger";
}) {
  return (
    <div className={"kpi" + (variant ? " " + variant : "")}>
      <div className="kpi-head">
        <div className="kpi-icon"><span className="ms">{icon}</span></div>
        <div className="kpi-label">{label}</div>
      </div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/Modal";
import {
  FilterBar,
  FilterClearButton,
  FilterResultMeta,
  FilterSearch,
  FilterSelect,
} from "@/components/EntityFilterBar";
import { usePermissions } from "@/components/PermissionsProvider";
import { deleteAgent } from "@/lib/actions";
import { matchesSearch } from "@/lib/filters";
import { agentColor, initials } from "@/lib/palette";
import { localized, type Agent, type Owner } from "@/lib/types";

import { AgentFormModal } from "./AgentFormModal";

type View = "grid" | "list";

export function AgentsClient({
  agents,
  owners,
  locale,
}: {
  agents: Agent[];
  owners: Owner[];
  locale: string;
}) {
  const t = useTranslations("agents");
  const tCommon = useTranslations("common");
  const tFilters = useTranslations("filters");
  const { can } = usePermissions();
  const canDelete = can("agents", "delete");

  const [search, setSearch] = useState("");
  const [ownerLinkFilter, setOwnerLinkFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [view, setView] = useState<View>("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [confirmDel, setConfirmDel] = useState<Agent | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ownerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const o of owners) {
      if (o.agent_id != null) {
        counts.set(o.agent_id, (counts.get(o.agent_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [owners]);

  const filtered = agents.filter((a) => {
    if (
      !matchesSearch(
        [a.name, a.name_en, a.name_ar, a.phone, a.email, a.national_id, a.bank_name, a.iban],
        search,
      )
    ) {
      return false;
    }
    const linked = ownerCounts.get(a.id) ?? 0;
    if (ownerLinkFilter === "has_owners" && linked === 0) return false;
    if (ownerLinkFilter === "no_owners" && linked > 0) return false;
    if (contactFilter === "email" && !a.email) return false;
    if (contactFilter === "phone" && !a.phone) return false;
    if (contactFilter === "missing" && (a.email || a.phone)) return false;
    return true;
  });

  const filtersActive =
    Boolean(search) || ownerLinkFilter !== "all" || contactFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setOwnerLinkFilter("all");
    setContactFilter("all");
  };

  const linkedOwners = owners.filter((o) => o.agent_id != null).length;

  const doDelete = () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setDelErr(null);
    start(async () => {
      const res = await deleteAgent(target.id);
      if (!res.ok) {
        setDelErr(res.error);
        return;
      }
      setConfirmDel(null);
    });
  };

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{t("title")}</h2>
          <div className="page-subtitle">{t("subtitle")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <span className="ms">add</span> {tCommon("addNew")}
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Kpi icon="support_agent" label={t("totalAgents")} value={String(agents.length)} />
        <Kpi icon="group" label={t("linkedOwners")} value={String(linkedOwners)} variant="success" />
        <Kpi icon="person_off" label={t("unassignedOwners")} value={String(owners.length - linkedOwners)} />
      </div>

      <FilterBar
        trailing={
          <>
            <FilterResultMeta
              showing={filtered.length}
              total={agents.length}
              label={tCommon("showingResults")}
            />
            {filtersActive && (
              <FilterClearButton label={tCommon("clearFilters")} onClick={clearFilters} />
            )}
            <div className="view-toggle">
              <button
                className={"vt-btn" + (view === "grid" ? " active" : "")}
                onClick={() => setView("grid")}
                title={tCommon("grid")}
              >
                <span className="ms ms-sm">grid_view</span>
              </button>
              <button
                className={"vt-btn" + (view === "list" ? " active" : "")}
                onClick={() => setView("list")}
                title={tCommon("list")}
              >
                <span className="ms ms-sm">view_list</span>
              </button>
            </div>
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
          label={tFilters("ownerLink")}
          value={ownerLinkFilter}
          onChange={setOwnerLinkFilter}
          options={[
            { value: "all", label: tFilters("ownerLinkAll") },
            { value: "has_owners", label: tFilters("ownerLinkHas") },
            { value: "no_owners", label: tFilters("ownerLinkNone") },
          ]}
        />
        <FilterSelect
          label={tFilters("contactInfo")}
          value={contactFilter}
          onChange={setContactFilter}
          options={[
            { value: "all", label: tFilters("contactAll") },
            { value: "email", label: tFilters("contactEmail") },
            { value: "phone", label: tFilters("contactPhone") },
            { value: "missing", label: tFilters("contactMissing") },
          ]}
        />
      </FilterBar>

      {filtered.length === 0 ? (
        <Empty icon="support_agent" title={t("noAgents")} subtitle={t("noAgentsHint")} />
      ) : view === "grid" ? (
        <div className="owner-grid">
          {filtered.map((a) => {
            const c = agentColor(a.id);
            const display = localized(a, "name", locale);
            const alt = localized(a, "name", locale === "ar" ? "en" : "ar") || a.name;
            const init = initials(a.name_en ?? a.name);
            const ownerCount = ownerCounts.get(a.id) ?? 0;
            return (
              <div key={a.id} className="owner-card">
                <div
                  className="owner-cover"
                  style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}
                >
                  <div className="owner-cover-actions">
                    <button
                      className="owner-icon-btn"
                      title={tCommon("edit")}
                      onClick={() => { setEditing(a); setFormOpen(true); }}
                    >
                      <span className="ms ms-sm">edit</span>
                    </button>
                    {canDelete && (
                      <button
                        className="owner-icon-btn"
                        title={tCommon("delete")}
                        onClick={() => setConfirmDel(a)}
                      >
                        <span className="ms ms-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="owner-body">
                  <div
                    className="owner-avatar"
                    style={{
                      background: `linear-gradient(135deg, ${c}, ${c}cc)`,
                      boxShadow: `0 6px 18px -8px ${c}80`,
                    }}
                  >
                    {init}
                  </div>
                  <div className="owner-name-line">
                    <div className="owner-name">{display}</div>
                    {alt && alt !== display && <div className="owner-name-alt">{alt}</div>}
                  </div>
                  <div className="owner-contacts">
                    {a.phone && (
                      <a className="owner-contact" href={`tel:${a.phone}`}>
                        <span className="ms ms-sm">call</span>
                        <span className="mono">{a.phone}</span>
                      </a>
                    )}
                    {a.email && (
                      <a className="owner-contact" href={`mailto:${a.email}`}>
                        <span className="ms ms-sm">mail</span>
                        <span>{a.email}</span>
                      </a>
                    )}
                  </div>
                  <div className="owner-stats">
                    <div className="ostat">
                      <div className="ostat-num">{ownerCount}</div>
                      <div className="ostat-lbl">{t("owners")}</div>
                    </div>
                  </div>
                  {a.iban && (
                    <div className="owner-foot">
                      <div className="bank-chip">
                        <span className="ms ms-sm">account_balance</span>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {a.iban.slice(0, 9)}…
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card card-tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tCommon("name")}</th>
                  <th>{tCommon("phone")}</th>
                  <th>{tCommon("email")}</th>
                  <th className="num">{t("owners")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>{localized(a, "name", locale)}</td>
                    <td className="mono text-sec">{a.phone ?? "—"}</td>
                    <td className="text-sec">{a.email ?? "—"}</td>
                    <td className="num">{ownerCounts.get(a.id) ?? 0}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button
                          className="icon-btn"
                          title={tCommon("edit")}
                          onClick={() => { setEditing(a); setFormOpen(true); }}
                        >
                          <span className="ms ms-sm">edit</span>
                        </button>
                        {canDelete && (
                          <button
                            className="icon-btn"
                            title={tCommon("delete")}
                            onClick={() => setConfirmDel(a)}
                          >
                            <span className="ms ms-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <AgentFormModal
          key={editing?.id ?? "new"}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          agent={editing}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => setConfirmDel(null)}
        title={t("deleteTitle")}
        message={delErr ?? t("deleteMessage", {
          name: confirmDel ? localized(confirmDel, "name", locale) : "",
        })}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        destructive
        loading={pending}
        onConfirm={doDelete}
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

function Empty({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <span className="ms">{icon}</span>
      </div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{subtitle}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { UserAvatar } from "@/components/UserAvatar";
import { closeTicket, reopenTicket, triageTicket } from "@/lib/account-actions";
import { formatDateTime } from "@/lib/format";
import { CATEGORY_ICON, PRIORITY_BADGE, STATUS_BADGE } from "@/lib/support-ui";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketDetail,
  type TicketPriority,
  type TicketStatus,
  type TicketUser,
} from "@/lib/types";

const MAX_FILE = 10 * 1024 * 1024;

export function TicketThread({
  ticket,
  isStaff,
  staff,
  meId,
  locale,
}: {
  ticket: TicketDetail;
  isStaff: boolean;
  staff: TicketUser[];
  meId: number;
  locale: string;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const isRequester = ticket.user.id === meId;
  // Staff acting on someone else's ticket get triage controls + internal notes.
  const staffView = isStaff && !isRequester;
  const closed = ticket.status === "closed";
  const done = ticket.status === "resolved" || closed;

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ticket.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!body.trim() && !file) return setError(t("replyEmpty"));
    if (file && file.size > MAX_FILE) return setError(t("fileTooLarge"));
    const fd = new FormData();
    fd.append("body", body.trim());
    if (staffView && internal) fd.append("internal", "true");
    if (file) fd.append("file", file);
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
      if (!res.ok) return setError(typeof data.detail === "string" ? data.detail : t("replyFailed"));
      setBody("");
      setFile(null);
      setInternal(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError(t("replyFailed"));
    } finally {
      setSending(false);
    }
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      router.refresh();
    });

  const statusLabel = (s: TicketStatus) =>
    !staffView && s === "waiting_user" ? t("status.waiting_you") : t(`status.${s}`);

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <Link href={`/${locale}/support`} className="text-sec" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="ms ms-sm flip-rtl">arrow_back</span> {t("backToTickets")}
          </Link>
          <h2 className="page-title" style={{ marginTop: 6 }}>{ticket.subject}</h2>
          <div className="text-sec" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="mono">{ticket.reference}</span>
            <span className={"badge " + STATUS_BADGE[ticket.status]}>{statusLabel(ticket.status)}</span>
            <span className={"badge " + PRIORITY_BADGE[ticket.priority]}>{t(`priority.${ticket.priority}`)}</span>
            <span>{t("openedOn", { date: formatDateTime(ticket.created_at, locale) })}</span>
          </div>
        </div>
        {isRequester && (
          <div style={{ display: "flex", gap: 8 }}>
            {done ? (
              <button className="btn btn-secondary" disabled={pending} onClick={() => act(() => reopenTicket(ticket.id))}>
                <span className="ms">replay</span> {t("reopen")}
              </button>
            ) : (
              <button className="btn btn-secondary" disabled={pending} onClick={() => act(() => closeTicket(ticket.id))}>
                <span className="ms">task_alt</span> {t("markSolved")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="support-layout">
        <div className="card ticket-thread-card">
          <div className="ticket-thread">
            {ticket.messages.map((m) => {
              const mine = m.author?.id === meId;
              const name = m.author ? m.author.full_name || m.author.username : "—";
              return (
                <div
                  key={m.id}
                  className={"msg" + (mine ? " mine" : "") + (m.is_staff ? " staff" : "") + (m.internal ? " internal" : "")}
                >
                  <UserAvatar name={name} url={m.author?.avatar_url} size={32} />
                  <div className="msg-bubble">
                    <div className="msg-hd">
                      <strong>{name}</strong>
                      {m.is_staff && <span className="badge badge-primary">{t("supportTeam")}</span>}
                      {m.internal && (
                        <span className="badge badge-warning"><span className="ms ms-sm">lock</span> {t("internalNote")}</span>
                      )}
                      <span className="text-sec">{formatDateTime(m.created_at, locale)}</span>
                    </div>
                    {m.body && <div className="msg-body">{m.body}</div>}
                    {m.attachment_url && (
                      <a className="msg-attachment" href={m.attachment_url} target="_blank" rel="noreferrer">
                        <span className="ms ms-sm">attach_file</span>
                        {m.attachment_name || t("attachment")}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {closed ? (
            <div className="ticket-closed-note">
              <span className="ms ms-sm">lock</span> {t("closedNote")}
            </div>
          ) : (
            <form className="ticket-reply" onSubmit={send}>
              {error && (
                <div className="badge badge-danger" role="alert" style={{ padding: "8px 12px", fontSize: 12 }}>
                  {error}
                </div>
              )}
              <textarea
                className={"textarea" + (internal ? " textarea-internal" : "")}
                rows={4}
                maxLength={10000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={internal ? t("internalPlaceholder") : t("replyPlaceholder")}
                aria-label={t("reply")}
              />
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="ticket-reply-bar">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                  <span className="ms ms-sm">attach_file</span> {file ? file.name : t("attachFile")}
                </button>
                {staffView && (
                  <label className="text-sec" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    {t("internalToggle")}
                  </label>
                )}
                <div style={{ flex: 1 }} />
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  <span className="ms ms-sm flip-rtl">send</span> {sending ? "…" : internal ? t("addNote") : t("send")}
                </button>
              </div>
              {done && !staffView && <div className="text-sec" style={{ fontSize: 11.5 }}>{t("replyReopens")}</div>}
            </form>
          )}
        </div>

        <aside className="support-aside">
          <div className="card">
            <div className="card-hd"><h3>{t("details")}</h3></div>
            <div className="card-body ticket-details">
              <Detail label={t("categoryLabel")}>
                <span className="ms ms-sm">{CATEGORY_ICON[ticket.category]}</span> {t(`category.${ticket.category}`)}
              </Detail>
              <Detail label={t("requester")}>
                <UserAvatar name={ticket.user.full_name || ticket.user.username} url={ticket.user.avatar_url} size={20} />
                {ticket.user.full_name || ticket.user.username}
              </Detail>
              <Detail label={t("assignee")}>
                {ticket.assignee ? ticket.assignee.full_name || ticket.assignee.username : <span className="text-sec">{t("unassigned")}</span>}
              </Detail>
              <Detail label={t("lastUpdate")}>{formatDateTime(ticket.updated_at, locale)}</Detail>
              {ticket.page_url && (
                <Detail label={t("reportedFrom")}>
                  <span className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{ticket.page_url}</span>
                </Detail>
              )}
              {staffView && ticket.user_agent && (
                <Detail label={t("browser")}>
                  <span className="text-sec" style={{ fontSize: 11, wordBreak: "break-word" }}>{ticket.user_agent}</span>
                </Detail>
              )}
            </div>
          </div>

          {staffView && (
            <div className="card">
              <div className="card-hd"><h3>{t("triage")}</h3></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label htmlFor="tr-status">{t("statusLabel")}</label>
                  <select
                    id="tr-status"
                    className="select"
                    value={ticket.status}
                    disabled={pending}
                    onChange={(e) => act(() => triageTicket(ticket.id, { status: e.target.value as TicketStatus }))}
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>{t(`status.${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="tr-priority">{t("priorityLabel")}</label>
                  <select
                    id="tr-priority"
                    className="select"
                    value={ticket.priority}
                    disabled={pending}
                    onChange={(e) => act(() => triageTicket(ticket.id, { priority: e.target.value as TicketPriority }))}
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{t(`priority.${p}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="tr-assignee">{t("assignee")}</label>
                  <select
                    id="tr-assignee"
                    className="select"
                    value={ticket.assignee?.id ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      act(() =>
                        e.target.value
                          ? triageTicket(ticket.id, { assignee_id: Number(e.target.value) })
                          : triageTicket(ticket.id, { unassign: true }),
                      )
                    }
                  >
                    <option value="">{t("unassigned")}</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.username}
                        {s.id === meId ? ` (${t("me")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ticket-detail-row">
      <div className="text-sec">{label}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  );
}

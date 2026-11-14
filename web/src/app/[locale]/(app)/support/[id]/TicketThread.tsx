"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { UserAvatar } from "@/components/UserAvatar";
import { closeTicket, rateTicket, reopenTicket, triageTicket, type TriageInput } from "@/lib/account-actions";
import { formatDateTime } from "@/lib/format";
import { CATEGORY_ICON, PRIORITY_BADGE, STATUS_BADGE } from "@/lib/support-ui";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketDetail,
  type TicketEvent,
  type TicketPriority,
  type TicketStatus,
  type TicketUser,
} from "@/lib/types";

const MAX_FILE = 10 * 1024 * 1024;
const STEPS: TicketStatus[] = ["open", "in_progress", "waiting_user", "resolved", "closed"];
const EVENT_ICON: Record<string, string> = {
  created: "add_circle",
  status: "sync_alt",
  priority: "flag",
  category: "label",
  assigned: "person_add",
  unassigned: "person_remove",
  reply: "chat",
  note: "lock",
  resolved: "task_alt",
  reopened: "replay",
  closed: "lock_clock",
  rated: "star",
};

const userName = (u: TicketUser | null | undefined) => (u ? u.full_name || u.username : "—");

export function TicketThread({
  ticket,
  isStaff,
  staff,
  meId,
  locale,
  base,
}: {
  ticket: TicketDetail;
  isStaff: boolean;
  staff: TicketUser[];
  meId: number;
  locale: string;
  base?: string;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const search = useSearchParams();
  const isRequester = ticket.user.id === meId;
  const canManage = ticket.can_manage || isStaff;
  // Handlers acting on someone else's ticket reply as support + may add notes.
  const staffView = canManage && !isRequester;
  const closed = ticket.status === "closed";
  const done = ticket.status === "resolved" || closed;

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, start] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState(ticket.resolution ?? "");
  const rateParam = Number(search?.get("rate") ?? 0);
  const [stars, setStars] = useState<number>(ticket.rating ?? (rateParam >= 1 && rateParam <= 5 ? rateParam : 0));
  const [ratingComment, setRatingComment] = useState(ticket.rating_comment ?? "");
  const [rated, setRated] = useState(Boolean(ticket.rating));
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const rateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rateParam && rateRef.current) rateRef.current.scrollIntoView({ block: "center" });
    else endRef.current?.scrollIntoView({ block: "end" });
  }, [ticket.messages.length, rateParam]);

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

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else after?.();
      router.refresh();
    });

  const triage = (input: TriageInput, after?: () => void) => act(() => triageTicket(ticket.id, input), after);

  const statusLabel = (s: TicketStatus) =>
    !staffView && s === "waiting_user" ? t("status.waiting_you") : t(`status.${s}`);

  const valueLabel = (ev: TicketEvent, v: string | null) => {
    if (!v) return "—";
    if (ev.kind === "status" || ev.kind === "resolved" || ev.kind === "closed" || ev.kind === "reopened")
      return (STEPS as string[]).includes(v) ? statusLabel(v as TicketStatus) : v;
    if (ev.kind === "priority") return (TICKET_PRIORITIES as readonly string[]).includes(v) ? t(`priority.${v}`) : v;
    if (ev.kind === "category") return (TICKET_CATEGORIES as readonly string[]).includes(v) ? t(`category.${v}`) : v;
    return v;
  };

  const eventText = (ev: TicketEvent) => {
    const key = ev.kind === "assigned" && ev.from_value ? "reassigned" : ev.kind;
    return t(`event.${key}`, { who: userName(ev.actor), from: valueLabel(ev, ev.from_value), to: valueLabel(ev, ev.to_value) });
  };

  const stepIndex = STEPS.indexOf(ticket.status);
  const onStatus = (s: TicketStatus) => {
    if (s === "resolved") {
      setResolving(true);
      return;
    }
    triage({ status: s });
  };

  return (
    <div className="page screen-enter">
      <div className="page-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link href={`${base ?? `/${locale}`}/support`} className="text-sec" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="ms ms-sm flip-rtl">arrow_back</span> {t("backToTickets")}
          </Link>
          <h2 className="page-title" style={{ marginTop: 6 }} dir="auto">{ticket.subject}</h2>
          <div className="text-sec" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="mono">{ticket.reference}</span>
            <span className={"badge " + STATUS_BADGE[ticket.status]}>{statusLabel(ticket.status)}</span>
            <span className={"badge " + PRIORITY_BADGE[ticket.priority]}>{t(`priority.${ticket.priority}`)}</span>
            <span className="badge badge-neutral">
              <span className="ms ms-sm">{CATEGORY_ICON[ticket.category]}</span> {t(`category.${ticket.category}`)}
            </span>
            {ticket.sla_state !== "none" && <span className={"sla-chip " + ticket.sla_state}>{t(`sla.${ticket.sla_state}`)}</span>}
            <span>{t("openedOn", { date: formatDateTime(ticket.created_at, locale) })}</span>
          </div>
          <ol className="ticket-steps" aria-label={t("progress")}>
            {STEPS.map((s, i) => (
              <li key={s} className={i < stepIndex ? "done" : i === stepIndex ? "current" : ""}>
                {statusLabel(s)}
              </li>
            ))}
          </ol>
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

      {error && (
        <div className="badge badge-danger" role="alert" style={{ display: "block", padding: "8px 12px", fontSize: 12.5, marginTop: 12, whiteSpace: "normal" }}>
          {error}
        </div>
      )}

      <div className="support-layout">
        <div className="card ticket-thread-card">
          {ticket.resolution && done && (
            <div className="resolution-card">
              <h4><span className="ms ms-sm">task_alt</span> {t("resolutionTitle")}</h4>
              <div className="msg-body" dir="auto">{ticket.resolution}</div>
            </div>
          )}

          {isRequester && done && (
            <div className="rating-card" ref={rateRef}>
              <div style={{ fontWeight: 600 }}>{rated ? t("yourRating") : t("rateTitle")}</div>
              {!rated && <div className="text-sec" style={{ fontSize: 12.5, marginBottom: 6 }}>{t("rateHint")}</div>}
              <div className={"rating-stars" + (rated ? " readonly" : "")} role="radiogroup" aria-label={t("rateTitle")}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n}/5`}
                    className={n <= stars ? "on" : ""}
                    disabled={rated}
                    onClick={() => setStars(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
              {rated ? (
                ticket.rating_comment && <div className="msg-body text-sec" dir="auto" style={{ marginTop: 6 }}>{ticket.rating_comment}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <textarea
                    className="textarea"
                    rows={2}
                    maxLength={2000}
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder={t("rateComment")}
                  />
                  <div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!stars || pending}
                      onClick={() => act(() => rateTicket(ticket.id, stars, ratingComment.trim() || undefined), () => setRated(true))}
                    >
                      <span className="ms ms-sm">star</span> {t("rateSubmit")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ticket-thread">
            {ticket.messages.map((m) => {
              const mine = m.author?.id === meId;
              const name = userName(m.author);
              return (
                <div
                  key={m.id}
                  className={"msg" + (mine ? " mine" : "") + (m.is_staff ? " staff" : "") + (m.internal ? " internal" : "")}
                >
                  <UserAvatar name={name} url={m.author?.avatar_url} size={32} />
                  <div className="msg-bubble">
                    <div className="msg-hd">
                      <strong dir="auto">{name}</strong>
                      {m.is_staff && <span className="badge badge-primary">{t("supportTeam")}</span>}
                      {m.internal && (
                        <span className="badge badge-warning"><span className="ms ms-sm">lock</span> {t("internalNote")}</span>
                      )}
                      <span className="text-sec">{formatDateTime(m.created_at, locale)}</span>
                    </div>
                    {m.body && <div className="msg-body" dir="auto">{m.body}</div>}
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
              <textarea
                className={"textarea" + (internal ? " textarea-internal" : "")}
                rows={4}
                maxLength={10000}
                value={body}
                dir="auto"
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
          {canManage && (
            <div className="card">
              <div className="card-hd"><h3>{t("triage")}</h3></div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label htmlFor="tr-assignee">{t("assignee")}</label>
                  <select
                    id="tr-assignee"
                    className="select"
                    value={ticket.assignee?.id ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      triage(e.target.value ? { assignee_id: Number(e.target.value) } : { unassign: true })
                    }
                  >
                    <option value="">{t("unassigned")}</option>
                    {ticket.assignee && !staff.some((s) => s.id === ticket.assignee!.id) && (
                      <option value={ticket.assignee.id}>{userName(ticket.assignee)}</option>
                    )}
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {userName(s)}
                        {s.job_title ? ` — ${s.job_title}` : ""}
                        {s.id === meId ? ` (${t("me")})` : ""}
                      </option>
                    ))}
                  </select>
                  {ticket.assignee?.id !== meId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: "flex-start", marginTop: 4 }}
                      disabled={pending}
                      onClick={() => triage({ assignee_id: meId })}
                    >
                      <span className="ms ms-sm">person_add</span> {t("assignToMe")}
                    </button>
                  )}
                  <div className="text-sec" style={{ fontSize: 11.5 }}>{t("assignHint")}</div>
                </div>
                <div className="field">
                  <label htmlFor="tr-status">{t("statusLabel")}</label>
                  <select
                    id="tr-status"
                    className="select"
                    value={resolving ? "resolved" : ticket.status}
                    disabled={pending}
                    onChange={(e) => onStatus(e.target.value as TicketStatus)}
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>{t(`status.${s}`)}</option>
                    ))}
                  </select>
                </div>
                {(resolving || (ticket.status !== "resolved" && !closed)) && (
                  <div className="field">
                    <label htmlFor="tr-resolution">{t("resolutionLabel")}</label>
                    <textarea
                      id="tr-resolution"
                      className="textarea"
                      rows={resolving ? 4 : 2}
                      maxLength={4000}
                      dir="auto"
                      value={resolution}
                      onFocus={() => setResolving(true)}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder={t("resolutionPlaceholder")}
                    />
                    {resolving && (
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pending}
                          onClick={() => {
                            if (!resolution.trim()) return setError(t("resolutionRequired"));
                            triage({ status: "resolved", resolution: resolution.trim() }, () => setResolving(false));
                          }}
                        >
                          <span className="ms ms-sm">task_alt</span> {t("saveResolution")}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResolving(false)}>
                          {t("cancel")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="tr-priority">{t("priorityLabel")}</label>
                  <select
                    id="tr-priority"
                    className="select"
                    value={ticket.priority}
                    disabled={pending}
                    onChange={(e) => triage({ priority: e.target.value as TicketPriority })}
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{t(`priority.${p}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="tr-category">{t("categoryLabel")}</label>
                  <select
                    id="tr-category"
                    className="select"
                    value={ticket.category}
                    disabled={pending}
                    onChange={(e) => triage({ category: e.target.value as TicketCategory })}
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{t(`category.${c}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-hd"><h3>{t("details")}</h3></div>
            <div className="card-body ticket-details">
              <Detail label={isRequester && !canManage ? t("handledBy") : t("assignee")}>
                {ticket.assignee ? (
                  <span className="assignee-line">
                    <UserAvatar name={userName(ticket.assignee)} url={ticket.assignee.avatar_url} size={24} />
                    <span>
                      {userName(ticket.assignee)}
                      {ticket.assignee.job_title && <small>{ticket.assignee.job_title}</small>}
                    </span>
                  </span>
                ) : (
                  <span className="text-sec">{isRequester ? t("notAssignedYet") : t("unassigned")}</span>
                )}
              </Detail>
              <Detail label={t("requester")}>
                <UserAvatar name={userName(ticket.user)} url={ticket.user.avatar_url} size={20} />
                {userName(ticket.user)}
              </Detail>
              <Detail label={t("lastUpdate")}>{formatDateTime(ticket.updated_at, locale)}</Detail>
              {ticket.page_url && (
                <Detail label={t("reportedFrom")}>
                  <span className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{ticket.page_url}</span>
                </Detail>
              )}
              {canManage && ticket.user_agent && (
                <Detail label={t("browser")}>
                  <span className="text-sec" style={{ fontSize: 11, wordBreak: "break-word" }}>{ticket.user_agent}</span>
                </Detail>
              )}
              {ticket.rating && !isRequester && (
                <Detail label={t("customerRating")}>
                  <span style={{ color: "#E0A100" }} dir="ltr">{"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}</span>
                  {ticket.rating_comment && <span className="text-sec" dir="auto">{ticket.rating_comment}</span>}
                </Detail>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><h3>{t("slaTitle")}</h3></div>
            <div className="card-body ticket-details">
              <Detail label={t("responseTarget")}>
                {ticket.response_due_at ? formatDateTime(ticket.response_due_at, locale) : "—"}
                {ticket.sla_state !== "none" && <span className={"sla-chip " + ticket.sla_state}>{t(`sla.${ticket.sla_state}`)}</span>}
              </Detail>
              {ticket.first_response_at && (
                <Detail label={t("firstResponse")}>{formatDateTime(ticket.first_response_at, locale)}</Detail>
              )}
              <Detail label={t("resolveTarget")}>{ticket.resolve_due_at ? formatDateTime(ticket.resolve_due_at, locale) : "—"}</Detail>
              {ticket.resolved_at && <Detail label={t("resolvedOn")}>{formatDateTime(ticket.resolved_at, locale)}</Detail>}
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><h3>{t("activity")}</h3></div>
            <div className="card-body">
              <ul className="ticket-events">
                {[...ticket.events].reverse().map((ev) => (
                  <li key={ev.id} className={ev.public ? "" : "private"}>
                    <span className="ev-icon"><span className="ms">{EVENT_ICON[ev.kind] ?? "history"}</span></span>
                    <div style={{ minWidth: 0 }}>
                      <div dir="auto">{eventText(ev)}</div>
                      <time dateTime={ev.created_at}>{formatDateTime(ev.created_at, locale)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ticket-detail-row">
      <div className="text-sec">{label}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

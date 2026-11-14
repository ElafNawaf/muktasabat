"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { geoGranted, getPosition } from "@/lib/geo";
import { hrCheckOut, hrPing, hrPresence } from "@/lib/hr-actions";

type Presence = { tracking: boolean; ping_minutes?: number; radius?: number; outside_since?: string | null };

/**
 * Runs on every staff page. While the employee is checked in on an office day
 * (and has already allowed location), it reports the location every few
 * minutes. If they're outside the office, a banner asks them to check out —
 * time outside isn't counted as worked. It never triggers a permission prompt.
 */
export function PresenceTracker() {
  const params = useParams<{ locale: string }>();
  const path = usePathname();
  const ar = (params?.locale ?? "ar") === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const [cfg, setCfg] = useState<Presence | null>(null);
  const [away, setAway] = useState<{ distance: number; since?: string | null } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);

  const refresh = useCallback(() => {
    hrPresence().then((r) => { if (r.ok) setCfg(r.data as Presence); });
  }, []);
  useEffect(() => { refresh(); }, [refresh, path]);

  const tick = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible" || !(await geoGranted())) return;
    busy.current = true;
    try {
      const g = await getPosition();
      if (!g.ok) return;
      const r = await hrPing(g.pos);
      if (!r.ok) return;
      const d = r.data as { tracking: boolean; inside?: boolean; distance?: number; outside_since?: string | null };
      if (!d.tracking) { setCfg({ tracking: false }); setAway(null); return; }
      if (d.inside === false && d.distance != null) setAway({ distance: d.distance, since: d.outside_since });
      else if (d.inside) { setAway(null); setHidden(false); }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!cfg?.tracking) return;
    const ms = Math.max(1, cfg.ping_minutes ?? 5) * 60_000;
    const first = setTimeout(tick, 4000);
    const id = setInterval(tick, ms);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [cfg, tick]);

  if (done) return <div className="presence-bar is-ok" role="status">{done}</div>;
  if (!away || hidden) return null;
  return (
    <div className="presence-bar" role="alert">
      <span className="ms" aria-hidden>location_off</span>
      <div>
        <strong>{T(`أنت خارج المكتب (${Math.round(away.distance)} م)`, `You're outside the office (${Math.round(away.distance)} m)`)}</strong>
        <span>{T("إن كنت غادرت فسجّل الانصراف؛ الوقت خارج المكتب لا يُحتسب. في مهمة عمل؟ قدّم طلب عمل ميداني.", "If you've left, check out — time outside isn't counted. On a work errand? Raise a field-work request.")}{away.since ? T(` (منذ ${away.since})`, ` (since ${away.since})`) : ""}</span>
      </div>
      <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
        const g = await getPosition();
        const r = await hrCheckOut(g.ok ? g.pos : { error: g.error });
        if (r.ok) { setAway(null); setCfg({ tracking: false }); setDone(T("سُجّل انصرافك.", "You're checked out.")); setTimeout(() => setDone(null), 4000); }
      })}>{T("تسجيل الانصراف", "Check out")}</button>
      <Link className="btn btn-secondary btn-sm" href={`/${ar ? "ar" : "en"}/my-hr?new=work_location`}>{T("طلب عمل ميداني", "Field-work request")}</Link>
      <button className="presence-bar__x" aria-label={T("إخفاء", "Dismiss")} onClick={() => setHidden(true)}><span className="ms ms-sm">close</span></button>
    </div>
  );
}

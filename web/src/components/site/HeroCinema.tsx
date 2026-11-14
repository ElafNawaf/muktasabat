"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { Shurfat } from "./Shurfat";
import { SkylineArt } from "./SkylineArt";

type Option = { value: string; label: string };

export type HeroCinemaProps = {
  locale: string;
  kicker: string;
  title: string;
  subtitle?: string;
  badge: string;
  rotateLead: string;
  rotate: string[];
  slides: string[];
  video?: string | null;
  types: Option[];
  cities: Option[];
  chips: [string, string][];
  labels: {
    searchLabel: string;
    tabRent: string;
    tabSale: string;
    tabOwner: string;
    anyType: string;
    anyCity: string;
    search: string;
    ownerCta: string;
    ownerHint: string;
    popular: string;
    scroll: string;
    prev: string;
    next: string;
    pause: string;
    play: string;
    slide: string;
  };
};

/** Full-bleed, cinematic homepage hero: video → photo slideshow → animated
 *  skyline (whichever the editor has provided), a word-by-word headline,
 *  rotating property types, and a glass search panel that drives /listings. */
export function HeroCinema(p: HeroCinemaProps) {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"rent" | "sale" | "owner">("rent");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [word, setWord] = useState(0);
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [videoOk, setVideoOk] = useState(false);
  const L = (path: string) => `/${p.locale}${path}`;
  const hasSlides = p.slides.length > 0;
  // Photos / video get a dark veil + white type; the default artwork is a calm daylight scene.
  const hasMedia = hasSlides || !!p.video;

  // Pointer-driven depth: the skyline layers, colour light and cursor glow
  // follow the mouse (mouse only; off under reduced motion).
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        el.style.setProperty("--gx", `${Math.round(e.clientX - r.left)}px`);
        el.style.setProperty("--gy", `${Math.round(e.clientY - r.top)}px`);
        el.classList.add("is-pointer");
      });
    };
    const onLeave = () => {
      el.classList.remove("is-pointer");
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Rotating property-type word.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setWord((w) => (w + 1) % p.rotate.length), 2200);
    return () => window.clearInterval(id);
  }, [p.rotate.length]);

  // Slideshow timer.
  useEffect(() => {
    if (p.slides.length < 2 || !playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % p.slides.length), 6500);
    return () => window.clearInterval(id);
  }, [p.slides.length, playing]);

  // Only stream the video on decent connections and when motion is welcome.
  useEffect(() => {
    if (!p.video) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
    const slow = nav.connection?.saveData || /(^|-)2g|3g/.test(nav.connection?.effectiveType || "");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setVideoOk(!slow && !still);
  }, [p.video]);

  // Pointer + scroll parallax → CSS custom properties (no re-renders).
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      const sy = Math.min(1, window.scrollY / Math.max(1, el.offsetHeight));
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
      el.style.setProperty("--sy", sy.toFixed(3));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = ((e.clientY - r.top) / r.height) * 2 - 1;
      queue();
    };
    el.addEventListener("pointermove", onMove);
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", queue);
      cancelAnimationFrame(raf);
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "owner") {
      router.push(L("/contact?kind=valuation"));
      return;
    }
    const q = new URLSearchParams({ purpose: tab });
    if (type) q.set("type", type);
    if (city) q.set("city", city);
    router.push(L(`/listings?${q.toString()}`));
  }

  const words = p.title.split(/\s+/).filter(Boolean);

  return (
    <section
      ref={root}
      className={`mk-cine${hasMedia ? " mk-cine--media" : ""}`}
      data-hero-dark={hasMedia || undefined}
      aria-labelledby="mk-cine-h"
    >
      {/* ── Backdrop ── */}
      <div className="mk-cine__bg" aria-hidden="true">
        <div className="mk-aurora">
          <span className="mk-aurora__b mk-aurora__b--1" />
          <span className="mk-aurora__b mk-aurora__b--2" />
          <span className="mk-aurora__b mk-aurora__b--3" />
          <span className="mk-aurora__b mk-aurora__b--4" />
        </div>
        {hasSlides ? (
          p.slides.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src + i}
              src={src}
              alt=""
              className={`mk-cine__slide${i === slide ? " is-on" : ""}`}
              fetchPriority={i === 0 ? "high" : "low"}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          ))
        ) : (
          <SkylineArt className="mk-cine__sky" />
        )}
        {p.video && videoOk && (
          <video
            className="mk-cine__video"
            src={p.video}
            poster={p.slides[0]}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoOk(false)}
          />
        )}
        <div className="mk-cine__veil" />
        <div className="mk-cine__grain" />
        <div className="mk-cine__glow" />
      </div>

      <ul className="mk-floaters" aria-hidden="true">
        {(p.locale === "ar"
          ? [["contract", "عقود موثّقة في إيجار"], ["monitoring", "تقارير شهرية للملاك"], ["campaign", "تسويق يصل للمستأجر الصحيح"]]
          : [["contract", "Leases registered on Ejar"], ["monitoring", "Monthly owner reports"], ["campaign", "Marketing that finds tenants"]]
        ).map(([icon, text], i) => (
          <li key={icon} className={`mk-floater mk-floater--${i + 1}`}>
            <span className="ms">{icon}</span>
            {text}
          </li>
        ))}
      </ul>

      <div className="mk-wrap mk-cine__inner">
        <div className="mk-cine__copy">
          <p className="mk-cine__badge">
            <span className="mk-cine__dot" aria-hidden="true" />
            {p.badge}
          </p>

          <h1 id="mk-cine-h" className="mk-cine__h1">
            <span className="mk-cine__kicker">{p.kicker}</span>
            <span className="mk-cine__title">
              {words.map((w, i) => (
                <Fragment key={i}>
                  <span className="mk-cine__word" style={{ ["--i" as string]: i }}>{w}</span>
                  {i < words.length - 1 ? " " : ""}
                </Fragment>
              ))}
            </span>
          </h1>

          <p className="mk-cine__rotate" aria-live="off">
            {p.rotateLead}{" "}
            <span className="mk-cine__rot" aria-hidden="true">
              {p.rotate.map((r, i) => (
                <span key={r} className={i === word ? "is-on" : i === (word - 1 + p.rotate.length) % p.rotate.length ? "is-out" : ""}>
                  {r}
                </span>
              ))}
            </span>
            <span className="mk-sr">{p.rotate.join("، ")}</span>
          </p>

          {p.subtitle && <p className="mk-cine__lead">{p.subtitle}</p>}
        </div>

        {/* ── Search panel ── */}
        <form className="mk-cine__search" onSubmit={submit} role="search" aria-label={p.labels.searchLabel}>
          <div className="mk-cine__tabs" role="tablist" aria-label={p.labels.searchLabel}>
            {(["rent", "sale", "owner"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "is-on" : undefined}
                onClick={() => setTab(k)}
              >
                {k === "rent" ? p.labels.tabRent : k === "sale" ? p.labels.tabSale : p.labels.tabOwner}
              </button>
            ))}
            <span className="mk-cine__tabbar" data-tab={tab} aria-hidden="true" />
          </div>

          {tab === "owner" ? (
            <div className="mk-cine__owner">
              <p>{p.labels.ownerHint}</p>
              <button className="mk-btn mk-btn--primary mk-btn--glow" type="submit">
                <span className="ms" aria-hidden="true">real_estate_agent</span>
                {p.labels.ownerCta}
              </button>
            </div>
          ) : (
            <div className={`mk-cine__fields${p.cities.length > 1 ? "" : " mk-cine__fields--2"}`}>
              <label className="mk-cine__field">
                <span className="ms" aria-hidden="true">home_work</span>
                <span className="mk-sr">{p.labels.anyType}</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">{p.labels.anyType}</option>
                  {p.types.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              {p.cities.length > 1 && (
              <label className="mk-cine__field">
                <span className="ms" aria-hidden="true">location_on</span>
                <span className="mk-sr">{p.labels.anyCity}</span>
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">{p.labels.anyCity}</option>
                  {p.cities.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              )}
              <button className="mk-btn mk-btn--primary mk-btn--glow mk-cine__go" type="submit">
                <span className="ms" aria-hidden="true">search</span>
                {p.labels.search}
              </button>
            </div>
          )}

          <nav className="mk-cine__chips" aria-label={p.labels.popular}>
            <span>{p.labels.popular}:</span>
            {p.chips.map(([label, href]) => (
              <Link key={href} href={L(href)}>{label}</Link>
            ))}
          </nav>
        </form>
      </div>

      {hasSlides && p.slides.length > 1 && (
        <div className="mk-cine__ctrl">
          <button type="button" onClick={() => setSlide((s) => (s - 1 + p.slides.length) % p.slides.length)} aria-label={p.labels.prev}>
            <span className="ms mk-flip" aria-hidden="true">chevron_left</span>
          </button>
          <ol>
            {p.slides.map((_, i) => (
              <li key={i}>
                <button type="button" className={i === slide ? "is-on" : undefined} onClick={() => setSlide(i)} aria-label={`${p.labels.slide} ${i + 1}`} aria-current={i === slide} />
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setSlide((s) => (s + 1) % p.slides.length)} aria-label={p.labels.next}>
            <span className="ms mk-flip" aria-hidden="true">chevron_right</span>
          </button>
          <button type="button" onClick={() => setPlaying((v) => !v)} aria-label={playing ? p.labels.pause : p.labels.play}>
            <span className="ms" aria-hidden="true">{playing ? "pause" : "play_arrow"}</span>
          </button>
        </div>
      )}

      <a href="#mk-after-hero" className="mk-cine__scroll">
        <span>{p.labels.scroll}</span>
        <i aria-hidden="true" />
      </a>

      <Shurfat className="mk-cine__crown" />
    </section>
  );
}

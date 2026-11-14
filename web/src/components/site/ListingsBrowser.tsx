"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { pick, type Listing } from "@/lib/cms";

import { ListingCard } from "./ListingCard";

type Filters = {
  q: string;
  purpose: "all" | "rent" | "sale";
  type: string;
  city: string;
  district: string;
  maxPrice: string;
  beds: string;
  sort: "new" | "low" | "high" | "area";
};

const EMPTY: Filters = { q: "", purpose: "all", type: "", city: "", district: "", maxPrice: "", beds: "", sort: "new" };
const KEYS = Object.keys(EMPTY) as (keyof Filters)[];

/** Filters live in the URL (?purpose=rent&type=apartment…) so a search can be
 *  shared on WhatsApp and survives the back button. */
export function ListingsBrowser({ listings, locale }: { listings: Listing[]; locale: string }) {
  const t = useTranslations("site.listings");
  const [f, setF] = useState<Filters>(EMPTY);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const next = { ...EMPTY };
    for (const k of KEYS) {
      const v = q.get(k);
      if (v) (next as Record<string, string>)[k] = v;
    }
    setF(next);
  }, []);

  function update(patch: Partial<Filters>) {
    const next = { ...f, ...patch };
    if (patch.city !== undefined && patch.city !== f.city) next.district = "";
    setF(next);
    const q = new URLSearchParams();
    for (const k of KEYS) if (next[k] && next[k] !== EMPTY[k]) q.set(k, String(next[k]));
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const city = (l: Listing) => pick(locale, l, "city");
  const district = (l: Listing) => pick(locale, l, "district");

  const scoped = f.purpose === "all" ? listings : listings.filter((l) => l.purpose === f.purpose);
  const types = useMemo(() => Array.from(new Set(scoped.map((l) => l.property_type))), [scoped]);
  const cities = useMemo(() => Array.from(new Set(scoped.map(city).filter(Boolean))), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  const districts = useMemo(
    () => Array.from(new Set(scoped.filter((l) => !f.city || city(l) === f.city).map(district).filter(Boolean))),
    [scoped, f.city], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shown = useMemo(() => {
    const max = Number(f.maxPrice) || 0;
    const beds = Number(f.beds) || 0;
    const needle = f.q.trim().toLowerCase();
    const hay = (l: Listing) =>
      [l.title_ar, l.title_en, l.city_ar, l.city_en, l.district_ar, l.district_en, l.ref, t(`t_${l.property_type}`)].filter(Boolean).join(" ").toLowerCase();
    const out = scoped.filter(
      (l) =>
        (!needle || needle.split(/\s+/).every((w) => hay(l).includes(w))) &&
        (!f.type || l.property_type === f.type) &&
        (!f.city || city(l) === f.city) &&
        (!f.district || district(l) === f.district) &&
        (!max || (l.price != null && l.price <= max)) &&
        (!beds || (l.bedrooms ?? 0) >= beds),
    );
    const price = (l: Listing) => l.price ?? Number.POSITIVE_INFINITY;
    if (f.sort === "low") out.sort((a, b) => price(a) - price(b));
    else if (f.sort === "high") out.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    else if (f.sort === "area") out.sort((a, b) => (b.area_sqm ?? 0) - (a.area_sqm ?? 0));
    return out;
  }, [scoped, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = KEYS.some((k) => k !== "sort" && f[k] !== EMPTY[k]);
  const counts = { rent: listings.filter((l) => l.purpose === "rent").length, sale: listings.filter((l) => l.purpose === "sale").length };

  return (
    <div className="mk-browse">
      <div className="mk-seg" role="group" aria-label={t("title")}>
        {(["all", "rent", "sale"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={f.purpose === p} className={f.purpose === p ? "is-on" : undefined} onClick={() => update({ purpose: p, type: "" })}>
            {p === "all" ? t("any") : t(p)}
            {p !== "all" && <small>{counts[p]}</small>}
          </button>
        ))}
      </div>

      <label className="mk-qsearch">
        <span className="ms" aria-hidden="true">search</span>
        <span className="mk-sr">{t("search")}</span>
        <input type="search" value={f.q} placeholder={t("searchPh")} onChange={(e) => update({ q: e.target.value })} enterKeyHint="search" />
      </label>

      <div className="mk-filters">
        <label className="mk-select">
          <span>{t("type")}</span>
          <select value={f.type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">{t("any")}</option>
            {types.map((v) => (
              <option key={v} value={v}>{t(`t_${v}`)}</option>
            ))}
          </select>
        </label>
        {cities.length > 1 && (
          <label className="mk-select">
            <span>{t("city")}</span>
            <select value={f.city} onChange={(e) => update({ city: e.target.value })}>
              <option value="">{t("any")}</option>
              {cities.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        <label className="mk-select">
          <span>{t("district")}</span>
          <select value={f.district} onChange={(e) => update({ district: e.target.value })}>
            <option value="">{t("any")}</option>
            {districts.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="mk-select">
          <span>{t("maxPrice")}</span>
          <input type="number" inputMode="numeric" min={0} step={5000} dir="ltr" value={f.maxPrice} placeholder="—" onChange={(e) => update({ maxPrice: e.target.value })} />
        </label>
        <label className="mk-select">
          <span>{t("minBeds")}</span>
          <select value={f.beds} onChange={(e) => update({ beds: e.target.value })}>
            <option value="">{t("any")}</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}+</option>
            ))}
          </select>
        </label>
        <label className="mk-select">
          <span>{t("sort")}</span>
          <select value={f.sort} onChange={(e) => update({ sort: e.target.value as Filters["sort"] })}>
            <option value="new">{t("sortNew")}</option>
            <option value="low">{t("sortLow")}</option>
            <option value="high">{t("sortHigh")}</option>
            <option value="area">{t("sortArea")}</option>
          </select>
        </label>
      </div>

      <div className="mk-browse__bar" aria-live="polite">
        <span>{t("results", { count: shown.length })}</span>
        {dirty && (
          <button type="button" className="mk-link mk-link--btn" onClick={() => update({ ...EMPTY, sort: f.sort })}>
            {t("reset")}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mk-empty">{t("noMatch")}</p>
      ) : (
        <div className="mk-listings">
          {shown.map((l, i) => (
            <ListingCard key={l.id} listing={l} locale={locale} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

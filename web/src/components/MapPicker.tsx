"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

// Riyadh — sensible default when the building has no coordinates yet.
const FALLBACK = { lat: 24.7136, lng: 46.6753 };

const Inner = dynamic(() => import("./MapPickerInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 280,
        borderRadius: 12,
        background: "var(--color-bg-deep)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-text-secondary)",
        fontSize: 13,
      }}
    >
      Loading map…
    </div>
  ),
});

export function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const t = useTranslations("mapPicker");
  const [latStr, setLatStr] = useState(lat == null ? "" : String(lat));
  const [lngStr, setLngStr] = useState(lng == null ? "" : String(lng));

  const showLat = lat ?? FALLBACK.lat;
  const showLng = lng ?? FALLBACK.lng;

  const onPick = (la: number, ln: number) => {
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    onChange(round(la), round(ln));
    setLatStr(String(round(la)));
    setLngStr(String(round(ln)));
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onPick(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const clear = () => {
    onChange(null, null);
    setLatStr("");
    setLngStr("");
  };

  const onManual = () => {
    const la = Number(latStr);
    const ln = Number(lngStr);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return;
    onChange(la, ln);
  };

  return (
    <div className="field" style={{ flexDirection: "column" }}>
      <label>
        {t("label")}
        <span
          className="text-sec"
          style={{ marginInlineStart: 8, fontSize: 11, fontWeight: 400 }}
        >
          {t("hint")}
        </span>
      </label>
      <Inner lat={showLat} lng={showLng} onChange={onPick} />
      <div
        className="field-row"
        style={{ marginTop: 8, gap: 8, alignItems: "flex-end" }}
      >
        <div className="field" style={{ flex: 1 }}>
          <label style={{ fontSize: 11 }}>{t("latitude")}</label>
          <input
            className="input input-mono"
            type="number"
            step="any"
            value={latStr}
            onChange={(e) => setLatStr(e.target.value)}
            onBlur={onManual}
            placeholder="24.7136"
            dir="ltr"
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label style={{ fontSize: 11 }}>{t("longitude")}</label>
          <input
            className="input input-mono"
            type="number"
            step="any"
            value={lngStr}
            onChange={(e) => setLngStr(e.target.value)}
            onBlur={onManual}
            placeholder="46.6753"
            dir="ltr"
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={useMyLocation}
        >
          <span className="ms ms-sm">my_location</span> {t("useMyLocation")}
        </button>
        {(lat != null || lng != null) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
            <span className="ms ms-sm">close</span> {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}

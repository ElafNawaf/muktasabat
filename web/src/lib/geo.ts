"use client";

export type Pos = { lat: number; lng: number; accuracy: number };
export type GeoError = "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";

/** One high-accuracy reading. Waits up to 15 s; never uses a cached position. */
export function getPosition(): Promise<{ ok: true; pos: Pos } | { ok: false; error: GeoError }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return resolve({ ok: false, error: "unsupported" });
    if (!window.isSecureContext) return resolve({ ok: false, error: "insecure" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) } }),
      (e) => resolve({ ok: false, error: e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/** True only if the user already granted location (never triggers a prompt). */
export async function geoGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return st.state === "granted";
  } catch {
    return false;
  }
}

export function geoErrorText(e: GeoError, ar: boolean) {
  const m: Record<GeoError, [string, string]> = {
    denied: ["رفض المتصفح الوصول إلى موقعك. اسمح بالموقع لهذا الموقع من إعدادات المتصفح (رمز القفل بجانب العنوان) ثم أعد المحاولة.", "Location access is blocked. Allow location for this site in your browser settings (the lock icon next to the address) and try again."],
    unavailable: ["تعذّر تحديد موقعك. فعّل خدمة الموقع (GPS) في جهازك ثم أعد المحاولة.", "Your location couldn't be found. Turn on location services (GPS) on your device and try again."],
    timeout: ["استغرق تحديد الموقع وقتًا طويلًا. اقترب من نافذة أو فعّل الموقع الدقيق ثم أعد المحاولة.", "Finding your location took too long. Move near a window or turn on precise location and try again."],
    unsupported: ["هذا المتصفح لا يدعم تحديد الموقع.", "This browser doesn't support location."],
    insecure: ["تحديد الموقع يتطلب اتصالًا آمنًا (https).", "Location needs a secure (https) connection."],
  };
  return m[e][ar ? 0 : 1];
}

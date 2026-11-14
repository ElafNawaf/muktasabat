"use client";

import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";

/** After a deploy, a tab opened on the previous version can call server code that
 *  no longer exists. Those errors fix themselves with one reload. */
const STALE = /Failed to find Server Action|ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|server action/i;

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [ar, setAr] = useState(true);
  useEffect(() => {
    setAr(!window.location.pathname.startsWith("/en"));
    console.error(error);
    const key = "mk-reloaded-at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (STALE.test(error?.message || "") && Date.now() - last > 30_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="err-page" dir={ar ? "rtl" : "ltr"}>
      <div className="err-card">
        <span className="brand-mark err-mark"><BrandLogo size={34} /></span>
        <h1>{ar ? "تعذّر عرض هذه الصفحة" : "This page couldn't load"}</h1>
        <p>
          {ar
            ? "ربما تم تحديث النظام قبل لحظات. حدّث الصفحة للمتابعة، وإذا تكرر الخطأ أرسل لنا الرمز أدناه."
            : "The system may have just been updated. Reload to continue; if it happens again, send us the code below."}
        </p>
        <div className="err-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <span className="ms ms-sm">refresh</span>
            {ar ? "تحديث الصفحة" : "Reload page"}
          </button>
          <button className="btn btn-secondary" onClick={() => reset()}>
            {ar ? "إعادة المحاولة" : "Try again"}
          </button>
          <a className="btn btn-ghost" href={ar ? "/ar/dashboard" : "/en/dashboard"}>
            {ar ? "لوحة التحكم" : "Dashboard"}
          </a>
        </div>
        {error?.digest && <small className="err-code" dir="ltr">Ref: {error.digest}</small>}
      </div>
    </div>
  );
}

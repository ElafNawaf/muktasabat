"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Cloudflare Turnstile — renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  function render() {
    if (!SITE_KEY || rendered.current || !ref.current || !window.turnstile) return;
    rendered.current = true;
    window.turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      callback: (tok: string) => onToken(tok),
      "expired-callback": () => onToken(null),
    });
  }

  useEffect(render);
  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="lazyOnload" onLoad={render} />
      <div ref={ref} className="mk-turnstile" />
    </>
  );
}

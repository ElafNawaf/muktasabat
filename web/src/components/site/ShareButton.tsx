"use client";

import { useState } from "react";

export function ShareButton({ title, label, copiedLabel }: { title: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked; nothing else to do */
    }
  }
  return (
    <button type="button" className="mk-btn mk-btn--quiet" onClick={share}>
      <span className="ms" aria-hidden="true">{copied ? "check" : "ios_share"}</span>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

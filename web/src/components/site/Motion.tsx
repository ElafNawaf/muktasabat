"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One tiny motion runtime for the whole public site (no animation library):
 *
 *  [data-reveal]        fades/slides in when scrolled into view (.is-in).
 *                       Variants via data-reveal="left|right|zoom|up".
 *                       Delay: style="--i: n" (× 70 ms) or children of [data-stagger].
 *  [data-count="1234"]  counts up from 0 when visible (data-suffix, data-decimals).
 *  [data-spot]          cursor spotlight: sets --mx/--my on pointer move.
 *  [data-tilt]          subtle 3D tilt towards the cursor (CSS `rotate`, so it
 *                       never fights the reveal `transform`).
 *  [data-progress]      sets --p (0…1) as the element scrolls through the viewport.
 *  .mk-progressbar      page reading progress.
 *
 * The `mk-js` class is set on <html> before first paint (root layout), so
 * content is never hidden for crawlers or no-JS visitors; and everything is
 * shown instantly under prefers-reduced-motion.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    html.classList.add("mk-js", "mk-motion-ready");

    // Stagger index for children of [data-stagger].
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((g) => {
      Array.from(g.children).forEach((c, i) => {
        const el = c as HTMLElement;
        if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
        if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", String(i % 10));
      });
    });

    const reveal = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]:not([data-counted])"));

    const runCount = (el: HTMLElement) => {
      el.setAttribute("data-counted", "");
      const target = Number(el.dataset.count || 0);
      const dec = Number(el.dataset.decimals || 0);
      const loc = el.dataset.locale === "ar" ? "ar-SA" : "en-US";
      const fmt = new Intl.NumberFormat(loc, { maximumFractionDigits: dec, minimumFractionDigits: dec });
      const suffix = el.dataset.suffix || "";
      if (reduce) {
        el.textContent = fmt.format(target) + suffix;
        return;
      }
      const start = performance.now();
      const dur = Number(el.dataset.duration || 1400);
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const v = target * (1 - Math.pow(1 - p, 4));
        el.textContent = fmt.format(dec ? v : Math.round(v)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    let io: IntersectionObserver | null = null;
    if (reduce || !("IntersectionObserver" in window)) {
      reveal.forEach((el) => el.classList.add("is-in"));
      counters.forEach(runCount);
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            if (el.hasAttribute("data-count")) runCount(el);
            else el.classList.add("is-in");
            io?.unobserve(el);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
      );
      reveal.forEach((el) => io!.observe(el));
      counters.forEach((el) => io!.observe(el));
    }

    // Elements rendered later (filters, carousels, client navigation) must
    // never stay hidden: watch the DOM and observe/reveal them too.
    const mo = new MutationObserver((muts) => {
      for (const m of muts)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const parent = n.parentElement;
          if (parent?.hasAttribute("data-stagger") && !n.hasAttribute("data-reveal")) n.setAttribute("data-reveal", "");
          const found = [n, ...Array.from(n.querySelectorAll<HTMLElement>("[data-reveal], [data-count]"))].filter(
            (el) => el.matches("[data-reveal]:not(.is-in), [data-count]:not([data-counted])"),
          );
          for (const el of found) {
            if (!io) {
              if (el.hasAttribute("data-count")) runCount(el);
              else el.classList.add("is-in");
            } else io.observe(el);
          }
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Spotlight + tilt (mouse only).
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const t = e.target as HTMLElement | null;
      const spot = t?.closest<HTMLElement>("[data-spot]");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      if (reduce) return;
      const tilt = t?.closest<HTMLElement>("[data-tilt]");
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        const ang = Math.min(7, Math.hypot(x, y) * 12);
        tilt.style.rotate = `${(-y).toFixed(3)} ${x.toFixed(3)} 0 ${ang.toFixed(2)}deg`;
      }
    };
    const onLeave = (e: PointerEvent) => {
      const tilt = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-tilt]");
      if (tilt && !(e.relatedTarget instanceof Node && tilt.contains(e.relatedTarget))) tilt.style.rotate = "";
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });

    // Scroll-linked progress (page bar + [data-progress] sections).
    const bar = document.querySelector<HTMLElement>(".mk-progressbar");
    const tracked = Array.from(document.querySelectorAll<HTMLElement>("[data-progress]"));
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (bar) bar.style.setProperty("--p", String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
        const vh = window.innerHeight;
        for (const el of tracked) {
          const r = el.getBoundingClientRect();
          const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3)));
          el.style.setProperty("--p", p.toFixed(3));
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      io?.disconnect();
      mo.disconnect();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return <div className="mk-progressbar" aria-hidden="true" />;
}

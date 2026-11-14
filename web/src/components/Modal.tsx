"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";

/**
 * Right-side drawer dialog used for every form in the app (Owner, Tenant,
 * Building, Unit, Contract, Expense, InviteUser, ImageGalleryEditor, …).
 *
 * The component is still named `Modal` to avoid touching every call site,
 * but the visual is a drawer per the prototype: slides in from the end edge
 * (right under LTR, left under RTL), full-height, with a sticky header and
 * footer.
 *
 * The `size` prop maps to a max-width so smaller dialogs (confirmations) take
 * less screen real estate. Mobile rules in globals.css override to full-width.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Material symbol shown in the header tile. Guessed from the title when omitted. */
  icon?: string;
}) {
  const locale = useLocale();
  const ar = locale === "ar";
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sections, setSections] = useState<string[]>([]);

  // Live "required fields" progress + section index for long forms.
  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;
    const scan = () => {
      const req = Array.from(body.querySelectorAll<HTMLElement>(".field")).filter((f) => f.querySelector(":scope > label .req, :scope > .bf-head .req, :scope label .req"));
      let done = 0;
      for (const f of req) {
        const ctl = Array.from(f.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type=hidden]):not([type=checkbox]), select, textarea"));
        if (ctl.some((c) => String(c.value ?? "").trim() !== "")) done++;
      }
      setProgress(req.length >= 2 ? { done, total: req.length } : null);
      setSections(Array.from(body.querySelectorAll(".fsec .fsec-title > span:first-child")).map((n) => n.textContent || ""));
    };
    scan();
    body.addEventListener("input", scan);
    body.addEventListener("change", scan);
    const mo = new MutationObserver(scan);
    mo.observe(body, { childList: true, subtree: true });
    return () => {
      body.removeEventListener("input", scan);
      body.removeEventListener("change", scan);
      mo.disconnect();
    };
  }, [open]);

  // Ctrl/⌘ + Enter saves (clicks the footer's primary button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        const btn = panelRef.current?.querySelector<HTMLButtonElement>(".modal-foot .btn-primary:not(:disabled), .modal-foot .btn-danger:not(:disabled)");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const glyph = icon ?? guessIcon(title);
  const jump = (i: number) => {
    const sec = bodyRef.current?.querySelectorAll<HTMLElement>(".fsec")[i];
    if (!sec) return;
    if (!sec.classList.contains("is-open")) sec.querySelector<HTMLButtonElement>(".fsec-hd")?.click();
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Drawer widths (CSS default is 540px; sm shrinks for confirmations,
  // lg widens for big multi-section forms).
  const widths: Record<typeof size, number> = { sm: 420, md: 540, lg: 720 };

  // Drawer must be a descendant of .modal-overlay so the
  // `.modal-overlay.open .modal { transform: translateX(0) }` selector matches —
  // otherwise the panel stays at translateX(100%) (offscreen) and looks "crashed".
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        ref={panelRef}
        className={`modal modal--${size}`}
        style={{ width: widths[size] }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hd">
          <span className="modal-hd__icon" aria-hidden="true"><span className="ms">{glyph}</span></span>
          <div className="modal-hd__text">
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
            {progress && (
              <div className="modal-progress" aria-live="polite">
                <span className="modal-progress__bar"><span style={{ width: `${(100 * progress.done) / progress.total}%` }} /></span>
                <small>
                  {progress.done === progress.total
                    ? ar ? "اكتملت الحقول المطلوبة" : "All required fields done"
                    : ar ? `${progress.done} من ${progress.total} حقول مطلوبة` : `${progress.done} of ${progress.total} required fields`}
                </small>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="ms ms-sm">close</span>
          </button>
        </div>
        {sections.length > 1 && (
          <nav className="modal-jump" aria-label={ar ? "أقسام النموذج" : "Form sections"}>
            {sections.map((t, i) => (
              <button key={i} type="button" onClick={() => jump(i)}><b>{i + 1}</b>{t}</button>
            ))}
          </nav>
        )}
        <div className="modal-body" ref={bodyRef}>{children}</div>
        {footer && (
          <div className="modal-foot">
            {footer}
            <span className="modal-foot__hint" aria-hidden="true"><span dir="ltr"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span> {ar ? "للحفظ" : "to save"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={"btn " + (destructive ? "btn-danger" : "btn-primary")}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.5, color: "var(--color-text-secondary)" }}>{message}</div>
    </Modal>
  );
}

/** Header icon from the form title (Arabic or English) when none is given. */
function guessIcon(title: string): string {
  const t = title.toLowerCase();
  const rules: [RegExp, string][] = [
    [/مستأجر|tenant/, "person_add"],
    [/مالك|owner/, "real_estate_agent"],
    [/وحدة|unit/, "door_front"],
    [/مبنى|عقار|building|propert/, "apartment"],
    [/إدارة أملاك|management/, "handshake"],
    [/عقد|contract|lease/, "contract"],
    [/دفع|سداد|payment|pay/, "payments"],
    [/تحويل|transfer/, "account_balance"],
    [/مصروف|expense/, "receipt_long"],
    [/صيانة|work order|maintenance/, "handyman"],
    [/مستخدم|user|دعوة|invite/, "manage_accounts"],
    [/وكيل|agent/, "support_agent"],
    [/موظف|employee/, "badge"],
    [/حذف|delete|remove/, "delete"],
    [/صور|photo|image/, "photo_library"],
    [/تذكرة|ticket|support/, "confirmation_number"],
    [/دور|role|صلاح/, "admin_panel_settings"],
  ];
  for (const [re, ic] of rules) if (re.test(t)) return ic;
  return "edit_note";
}

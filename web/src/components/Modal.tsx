"use client";

import { useEffect } from "react";

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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
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

  return (
    <>
      <div className="modal-overlay open" onClick={onClose} />
      <div
        className="modal"
        style={{ width: widths[size] }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hd">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="sub">{subtitle}</div>}
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
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
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

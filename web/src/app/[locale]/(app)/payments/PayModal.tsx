"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { markPaymentPaid, type PayInput } from "@/lib/actions";
import { formatSAR } from "@/lib/format";

import type { PaymentRow } from "./PaymentsClient";

const METHODS: { value: NonNullable<PayInput["payment_method"]>; icon: string }[] = [
  { value: "bank_transfer", icon: "account_balance" },
  { value: "cash", icon: "payments" },
  { value: "cheque", icon: "receipt" },
];

// Human label for a payment-split row, falling back to the raw type.
function splitLabel(type: string, t: (k: string) => string): string {
  const key = type.toLowerCase();
  if (/management|mgmt/.test(key)) return t("mgmtFee");
  if (/agent|broker/.test(key)) return t("agentFee");
  if (/ejar/.test(key)) return t("ejarFee");
  if (/owner|landlord|net/.test(key)) return t("ownerShare");
  return type.replace(/_/g, " ");
}

export function PayModal({
  open,
  onClose,
  payment,
}: {
  open: boolean;
  onClose: () => void;
  payment: PaymentRow;
}) {
  const t = useTranslations("paymentsPage");
  const tCommon = useTranslations("common");

  const [form, setForm] = useState<PayInput>({
    payment_method: "bank_transfer",
    receipt_number: "",
    paid_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof PayInput>(k: K, v: PayInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload: PayInput = {
      payment_method: form.payment_method,
      receipt_number: form.receipt_number?.toString().trim() || null,
      paid_date: form.paid_date || null,
      notes: form.notes?.toString().trim() || null,
    };
    start(async () => {
      const res = await markPaymentPaid(payment.id, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("markPaidTitle")}
      subtitle={t("markPaidSubtitle", { amount: payment.amount.toLocaleString() })}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="pay-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : t("confirmPaid")}
          </button>
        </>
      }
    >
      <form id="pay-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field">
          <label>{t("paymentMethod")}</label>
          <div className="radio-cards">
            {METHODS.map((m) => (
              <div
                key={m.value}
                className={"radio-card" + (form.payment_method === m.value ? " selected" : "")}
                onClick={() => set("payment_method", m.value)}
                style={{ textAlign: "center" }}
                role="radio"
                aria-checked={form.payment_method === m.value}
              >
                <span
                  className="ms"
                  style={{
                    fontSize: 22,
                    color:
                      form.payment_method === m.value
                        ? "var(--color-primary)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {m.icon}
                </span>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4 }}>
                  {t(`methods.${m.value}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("paidDate")}</label>
            <input
              className="input"
              type="date"
              value={form.paid_date ?? ""}
              onChange={(e) => set("paid_date", e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("receiptNumber")}</label>
            <input
              className="input input-mono"
              value={form.receipt_number ?? ""}
              onChange={(e) => set("receipt_number", e.target.value)}
              maxLength={50}
              dir="ltr"
            />
          </div>
        </div>
        <div className="field">
          <label>{t("notes")}</label>
          <textarea
            className="textarea"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {payment.splits && payment.splits.length > 0 && (
          <div className="field">
            <label>{t("splitTitle")}</label>
            <div className="split">
              <div className="item">
                <span className="lbl">{t("amount")}</span>
                <span className="val">{formatSAR(payment.amount, "en")}</span>
              </div>
              {payment.splits.map((s) => {
                const isOwner = /owner|landlord|net/i.test(s.split_type);
                return (
                  <div key={s.id} className={"item" + (isOwner ? " total" : "")}>
                    <span className="lbl">{s.description ?? splitLabel(s.split_type, t)}</span>
                    <span className="val">{formatSAR(s.amount, "en")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Modal } from "@/components/Modal";
import { markOwnerTransferred } from "@/lib/actions";

import type { PaymentRow } from "./PaymentsClient";

/** Record the owner's share as transferred (stops the owner-payout alerts). */
export function OwnerTransferModal({
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await markOwnerTransferred(payment.id, {
        transferred_date: date || null,
        reference: reference.trim() || null,
      });
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
      title={t("transferTitle")}
      subtitle={t("transferSubtitle", { amount: payment.amount.toLocaleString() })}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </button>
          <button type="submit" form="owner-transfer-form" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : t("confirmTransfer")}
          </button>
        </>
      }
    >
      <form id="owner-transfer-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div className="badge badge-danger" style={{ padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t("transferDate")}</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t("transferReference")}</label>
            <input
              className="input input-mono"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={80}
              dir="ltr"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

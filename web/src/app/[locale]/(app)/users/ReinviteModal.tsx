"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import type { ReinviteResult } from "@/lib/actions";

/** Results of "Re-send invitations": who got an email, plus a copy/WhatsApp
 *  link for anyone the email could not reach (e.g. SES sandbox). */
export function ReinviteModal({ result, locale, onClose }: { result: ReinviteResult | null; locale: string; onClose: () => void }) {
  const ar = locale === "ar";
  const [copied, setCopied] = useState<number | null>(null);
  if (!result) return null;
  const T = (a: string, e: string) => (ar ? a : e);
  async function copy(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  }
  const message = (username: string, url: string) =>
    T(
      `دعوة إلى نظام شركة مكتسبات العقارية\nاسم المستخدم: ${username}\nعيّن كلمة المرور (صالح 72 ساعة):\n${url}`,
      `Your Muktasabat invitation\nUsername: ${username}\nSet your password (valid 72 hours):\n${url}`,
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={T("نتيجة إعادة إرسال الدعوات", "Invitations re-sent")}
      subtitle={T(
        `أُرسلت ${result.sent.length} بالبريد، وتعذّر إرسال ${result.failed.length}. الروابط صالحة 72 ساعة.`,
        `${result.sent.length} emailed, ${result.failed.length} could not be emailed. Links are valid for 72 hours.`,
      )}
      footer={<button className="btn btn-primary" onClick={onClose}>{T("تم", "Done")}</button>}
    >
      <ul className="reinvite-list">
        {result.links.map((l) => (
          <li key={l.id}>
            <div className="reinvite-who">
              <strong>{l.username}</strong>
              <small dir="ltr">{l.email}</small>
            </div>
            <span className={`badge ${l.emailed ? "badge-success" : "badge-warning"}`}>
              {l.emailed ? T("أُرسلت بالبريد", "Emailed") : T("لم تصل بالبريد", "Not emailed")}
            </span>
            <div className="reinvite-actions">
              <button className="btn btn-sm btn-secondary" onClick={() => copy(l.id, message(l.username, l.url))}>
                <span className="ms ms-sm">{copied === l.id ? "check" : "content_copy"}</span>
                {copied === l.id ? T("نُسخ", "Copied") : T("نسخ الدعوة", "Copy invite")}
              </button>
              <a className="btn btn-sm btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(message(l.username, l.url))}`} target="_blank" rel="noopener noreferrer">
                <span className="ms ms-sm">chat</span>
                {T("واتساب", "WhatsApp")}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

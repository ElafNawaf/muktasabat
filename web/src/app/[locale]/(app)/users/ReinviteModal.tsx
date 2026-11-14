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
      {result.links.some((l) => l.reason === "ses_sandbox_unverified_recipient") && (
        <div className="reinvite-note" role="note">
          <span className="ms" aria-hidden>info</span>
          <div>
            {T(
              "لم تصل بعض الرسائل لأن خدمة البريد في Amazon (SES) ما زالت في الوضع التجريبي، وفيه لا تُرسل الرسائل إلا إلى عناوين تم التحقق منها مسبقًا. بعد موافقة Amazon على «طلب الوصول للإنتاج» ستصل الرسائل للجميع. إلى ذلك الحين شارك الدعوة عبر واتساب أو انسخها.",
              "Some emails were not delivered because Amazon's email service (SES) is still in sandbox mode, which only delivers to addresses verified in advance. Once Amazon approves production access, email will reach everyone. Until then, share the invite on WhatsApp or copy it.",
            )}
          </div>
        </div>
      )}
      <ul className="reinvite-list">
        {result.links.map((l) => (
          <li key={l.id}>
            <div className="reinvite-who">
              <strong>{l.username}</strong>
              <small dir="ltr">{l.email}</small>
            </div>
            <span className={`badge ${l.emailed ? "badge-success" : "badge-warning"}`}>
              {l.emailed ? T("أُرسلت بالبريد", "Emailed") : T("لم تُرسل بالبريد", "Not emailed")}
            </span>
            {!l.emailed && l.reason && (
              <small className="reinvite-reason">
                {l.reason === "ses_sandbox_unverified_recipient"
                  ? T("العنوان غير مُتحقَّق منه في SES (الوضع التجريبي)", "Address not verified in SES (sandbox)")
                  : l.reason === "ses_quota_exceeded"
                    ? T("تجاوز الحد اليومي للإرسال", "Daily sending limit reached")
                    : l.reason === "ses_permission_denied"
                      ? T("صلاحيات AWS لا تسمح بالإرسال", "AWS permissions block sending")
                      : T("تعذّر الإرسال", "Sending failed")}
              </small>
            )}
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

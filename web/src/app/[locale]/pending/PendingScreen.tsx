"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";

export function PendingScreen({ locale, username, email }: { locale: string; username: string; email: string }) {
  const ar = locale === "ar";
  const T = (a: string, e: string) => (ar ? a : e);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace(`/${locale}/login`);
  };
  return (
    <div className="login-page" dir={ar ? "rtl" : "ltr"}>
      <div className="login-card screen-enter pend-card">
        <div className="brand-block">
          <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 14 }}><BrandLogo size={42} /></div>
          <h1>شركة مكتسبات العقارية</h1>
          <div className="en-name">Muktasabat Real Estate</div>
        </div>
        <span className="ms pend-icon" aria-hidden>hourglass_top</span>
        <h2>{T("حسابك بانتظار تحديد الصلاحية", "Your account is waiting for a role")}</h2>
        <p className="text-sec">
          {T("أُنشئ حسابك بنجاح. لحماية بيانات الشركة والعملاء، لا يمكنك الاطلاع على أي بيانات حتى يحدد مسؤول النظام دورك. أُبلغ المسؤول بطلبك.",
            "Your account was created. To protect company and client data, you can't see anything until an administrator assigns your role. They've been told you're waiting.")}
        </p>
        <dl className="pend-who">
          <div><dt>{T("اسم المستخدم", "Username")}</dt><dd dir="ltr">{username}</dd></div>
          <div><dt>{T("البريد", "Email")}</dt><dd dir="ltr">{email}</dd></div>
        </dl>
        <div className="pend-actions">
          <button className="btn btn-primary" onClick={() => router.refresh()}><span className="ms ms-sm">refresh</span>{T("تحقّق مرة أخرى", "Check again")}</button>
          <button className="btn btn-secondary" disabled={busy} onClick={signOut}><span className="ms ms-sm">logout</span>{T("تسجيل الخروج", "Sign out")}</button>
        </div>
        <p className="text-sec pend-help">{T("للاستعجال تواصل مع الدعم الفني على 920007039.", "In a hurry? Call support on 920007039.")}</p>
      </div>
    </div>
  );
}

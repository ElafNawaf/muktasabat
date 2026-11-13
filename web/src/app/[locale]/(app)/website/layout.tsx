import { api } from "@/lib/api";
import { KIND_META, type CmsKind } from "@/lib/cms-fields";

import "./cms.css";
import { websitePerms } from "./perms";
import { WebsiteTabs } from "./WebsiteTabs";

export default async function WebsiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const perms = await websitePerms(locale);
  const ar = locale === "ar";
  if (!perms.view) {
    return (
      <div className="cms-root">
        <div className="cms-empty">
          <span className="ms">lock</span>
          <p>{ar ? "ليست لديك صلاحية إدارة محتوى الموقع. تواصل مع مدير النظام." : "You don't have access to website content. Ask an administrator to grant the Website permission."}</p>
        </div>
      </div>
    );
  }
  const inbox = await api.get<{ new_leads: number; new_applications: number }>("/api/v1/cms/admin/inbox").catch(() => ({ new_leads: 0, new_applications: 0 }));
  const kinds = Object.keys(KIND_META) as CmsKind[];
  const tabs = [
    { href: "leads", label: ar ? "الاستفسارات" : "Enquiries", icon: "inbox", badge: inbox.new_leads },
    { href: "applications", label: ar ? "طلبات التوظيف" : "Applications", icon: "badge", badge: inbox.new_applications },
    { href: "settings", label: ar ? "إعدادات الموقع" : "Site settings", icon: "tune" },
    ...kinds.map((k) => ({ href: k, label: ar ? KIND_META[k].title[1] : KIND_META[k].title[0], icon: KIND_META[k].icon })),
  ];
  return (
    <div className="cms-root">
      <header className="cms-head">
        <div>
          <h1>{ar ? "الموقع الإلكتروني" : "Website"}</h1>
          <p>{ar ? "إدارة محتوى موقع muktasabat.com العام." : "Manage the public muktasabat.com website."}</p>
        </div>
        <a className="cms-btn" href={`/${locale}`} target="_blank" rel="noreferrer">
          <span className="ms">open_in_new</span>
          {ar ? "عرض الموقع" : "View website"}
        </a>
      </header>
      <WebsiteTabs locale={locale} tabs={tabs} />
      {children}
    </div>
  );
}

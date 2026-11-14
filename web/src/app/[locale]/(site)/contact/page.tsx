import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LeadForm } from "@/components/site/LeadForm";
import { PageHead } from "@/components/site/PageHead";
import { ProjectMap } from "@/components/site/ProjectMap";
import { cms, tr, waLink } from "@/lib/cms";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return { title: t("nav.contact"), description: t("sections.contactLead"), alternates: { languages: { ar: "/ar/contact", en: "/en/contact" } } };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [site, t] = await Promise.all([cms.site(), getTranslations({ locale, namespace: "site" })]);
  const wa = waLink(site.whatsapp, t("contact.whatsappMsg"));
  return (
    <>
      <PageHead title={t("sections.contactTitle")} lead={t("sections.contactLead")} />
      <section className="mk-section">
        <div className="mk-wrap mk-split mk-split--form">
          <div>
            <dl className="mk-facts">
              {site.phone && (<div><dt>{t("contact.phone")}</dt><dd><a href={`tel:${site.phone.replace(/\s/g, "")}`} dir="ltr">{site.phone}</a></dd></div>)}
              {wa && (<div><dt>{t("contact.whatsapp")}</dt><dd><a href={wa} target="_blank" rel="noopener noreferrer" dir="ltr">{site.whatsapp}</a></dd></div>)}
              {site.email && (<div><dt>{t("contact.email")}</dt><dd><a href={`mailto:${site.email}`}>{site.email}</a></dd></div>)}
              {tr(locale, site.address) && (<div><dt>{t("contact.address")}</dt><dd>{tr(locale, site.address)}</dd></div>)}
              {tr(locale, site.working_hours) && (<div><dt>{t("contact.hours")}</dt><dd>{tr(locale, site.working_hours)}</dd></div>)}
            </dl>
            {site.map_lat != null && site.map_lng != null && (
              <div className="mk-mt"><ProjectMap lat={site.map_lat} lng={site.map_lng} label={tr(locale, site.brand_name)} /></div>
            )}
          </div>
          <LeadForm locale={locale} />
        </div>
      </section>
    </>
  );
}

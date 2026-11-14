import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/BrandLogo";
import { tr, waLink, type SiteData } from "@/lib/cms";

import { Shurfat } from "./Shurfat";

const SOCIAL_ICON: Record<string, string> = {
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
};

export async function SiteFooter({ locale, site }: { locale: string; site: SiteData }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const brand = tr(locale, site.brand_name);
  const wa = waLink(site.whatsapp, t("contact.whatsappMsg"));
  const social = Object.entries(site.social || {}).filter(([, v]) => !!v);
  const year = new Date().getFullYear();
  const L = (p: string) => `/${locale}${p}`;

  return (
    <footer className="mk-footer">
      <Shurfat className="mk-footer__crown" teeth={64} />
      <div className="mk-wrap mk-footer__grid">
        <div className="mk-footer__brand">
          <p className="mk-footer__name"><span className="mk-footer__logo" aria-hidden="true"><BrandLogo size={30} /></span>{brand}</p>
          {tr(locale, site.tagline) && <p className="mk-footer__tag">{tr(locale, site.tagline)}</p>}
          {social.length > 0 && (
            <ul className="mk-social" aria-label={t("footer.follow")}>
              {social.map(([k, v]) => (
                <li key={k}>
                  <a href={v!} target="_blank" rel="noopener noreferrer">{SOCIAL_ICON[k] ?? k}</a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav aria-label={t("footer.quickLinks")}>
          <p className="mk-footer__h">{t("footer.quickLinks")}</p>
          <ul>
            <li><Link href={L("/listings")}>{t("nav.listings")}</Link></li>
            <li><Link href={L("/about")}>{t("nav.about")}</Link></li>
            <li><Link href={L("/services")}>{t("nav.services")}</Link></li>
            <li><Link href={L("/for-owners")}>{t("nav.owners")}</Link></li>
            <li><Link href={L("/projects")}>{t("nav.projects")}</Link></li>
            <li><Link href={L("/news")}>{t("nav.news")}</Link></li>
            <li><Link href={L("/careers")}>{t("nav.careers")}</Link></li>
            <li><Link href={L("/login")}>{t("nav.portal")}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t("footerSeo.cities")}>
          <p className="mk-footer__h">{t("footerSeo.cities")}</p>
          <ul>
            <li><Link href={L("/listings?type=apartment")}>{t("listings.t_apartment")}</Link></li>
            <li><Link href={L("/listings?type=villa")}>{t("listings.t_villa")}</Link></li>
            <li><Link href={L("/listings?type=land")}>{t("listings.t_land")}</Link></li>
            <li><Link href={L("/listings?purpose=rent")}>{t("listings.rent")}</Link></li>
            <li><Link href={L("/listings?purpose=sale")}>{t("listings.sale")}</Link></li>
            <li><Link href={L("/contact?kind=valuation")}>{t("valuation.cta")}</Link></li>
          </ul>
        </nav>

        <div>
          <p className="mk-footer__h">{t("footer.contact")}</p>
          <ul>
            {site.phone && <li><a href={`tel:${site.phone.replace(/\s/g, "")}`} dir="ltr">{site.phone}</a></li>}
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer">{t("contact.whatsapp")}</a></li>}
            {site.email && <li><a href={`mailto:${site.email}`}>{site.email}</a></li>}
            {tr(locale, site.address) && <li>{tr(locale, site.address)}</li>}
            {tr(locale, site.working_hours) && <li>{tr(locale, site.working_hours)}</li>}
          </ul>
        </div>

        {(site.cr_number || site.fal_licence || site.vat_number) && (
          <div>
            <p className="mk-footer__h">{t("footer.legal")}</p>
            <dl className="mk-footer__legal">
              {site.cr_number && (<><dt>{t("footer.cr")}</dt><dd dir="ltr">{site.cr_number}</dd></>)}
              {site.fal_licence && (<><dt>{t("footer.fal")}</dt><dd dir="ltr">{site.fal_licence}</dd></>)}
              {site.vat_number && (<><dt>{t("footer.vat")}</dt><dd dir="ltr">{site.vat_number}</dd></>)}
            </dl>
          </div>
        )}
      </div>
      <div className="mk-wrap mk-footer__base">
        © {year} {brand}. {t("footer.rights")}
      </div>
    </footer>
  );
}

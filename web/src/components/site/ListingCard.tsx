"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { artVariant, listingPrice, pick, type Listing } from "@/lib/cms";

import { FacadeArt } from "./FacadeArt";


export function PriceTag({ listing, locale, size = "md" }: { listing: Listing; locale: string; size?: "md" | "lg" }) {
  const t = useTranslations("site.listings");
  const price = listingPrice(listing, locale);
  if (!price) return <p className={`mk-price mk-price--${size} mk-price--ask`}>{t("priceOnRequest")}</p>;
  const per = listing.price_period === "year" ? t("perYear") : listing.price_period === "month" ? t("perMonth") : "";
  return (
    <p className={`mk-price mk-price--${size}`}>
      <span className="mk-price__num">{price}</span>
      <span className="mk-price__cur">{t("sar")}</span>
      {per && <span className="mk-price__per">{per}</span>}
    </p>
  );
}

export function ListingSpecs({ listing, locale }: { listing: Listing; locale: string }) {
  const t = useTranslations("site.listings");
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const items: { icon: string; text: string; label: string }[] = [];
  if (listing.area_sqm) items.push({ icon: "square_foot", text: `${nf.format(listing.area_sqm)} ${t("sqm")}`, label: t("details") });
  if (listing.bedrooms) items.push({ icon: "bed", text: `${nf.format(listing.bedrooms)} ${t("beds")}`, label: t("beds") });
  if (listing.bathrooms) items.push({ icon: "bathtub", text: `${nf.format(listing.bathrooms)} ${t("baths")}`, label: t("baths") });
  if (listing.street_width_m && !listing.bedrooms) items.push({ icon: "add_road", text: `${nf.format(listing.street_width_m)} ${locale === "ar" ? "م" : "m"}`, label: t("street") });
  if (items.length === 0) return null;
  return (
    <ul className="mk-specs">
      {items.map((i) => (
        <li key={i.icon}>
          <span className="ms" aria-hidden="true">{i.icon}</span>
          {i.text}
        </li>
      ))}
    </ul>
  );
}

export function ListingCard({ listing, locale }: { listing: Listing; locale: string }) {
  const t = useTranslations("site.listings");
  const title = pick(locale, listing, "title");
  const where = [pick(locale, listing, "district"), pick(locale, listing, "city")].filter(Boolean).join(locale === "ar" ? "، " : ", ");
  const closed = listing.status !== "available";
  return (
    <Link href={`/${locale}/listings/${listing.slug}`} className={`mk-listing${closed ? " is-closed" : ""}`}>
      <div className="mk-listing__media">
        {listing.cover_url || listing.gallery[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.cover_url || listing.gallery[0]} alt="" loading="lazy" />
        ) : (
          <FacadeArt variant={artVariant(listing.property_type)} />
        )}
        <span className={`mk-listing__purpose mk-listing__purpose--${listing.purpose}`}>
          {t(listing.purpose)}
        </span>
        {closed ? (
          <span className="mk-listing__flag mk-listing__flag--closed">{t(`status_${listing.status}`)}</span>
        ) : listing.exclusive ? (
          <span className="mk-listing__flag">{t("exclusive")}</span>
        ) : null}
      </div>
      <div className="mk-listing__body">
        <p className="mk-listing__type">
          {t(`t_${listing.property_type}`)}
          {where && <span>{where}</span>}
        </p>
        <h3 className="mk-listing__title">{title}</h3>
        <ListingSpecs listing={listing} locale={locale} />
        <PriceTag listing={listing} locale={locale} />
      </div>
    </Link>
  );
}

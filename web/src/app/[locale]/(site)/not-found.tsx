import Link from "next/link";

import { Shurfat } from "@/components/site/Shurfat";

/** Bilingual 404: says what happened and offers the likely next steps. */
export default function SiteNotFound() {
  return (
    <section className="mk-section mk-404">
      <div className="mk-wrap mk-narrow mk-center">
        <Shurfat className="mk-404__motif" teeth={8} />
        <h1 className="mk-h1">لم نجد هذه الصفحة</h1>
        <p className="mk-lead">ربما نُقلت أو تغيّر رابطها. جرّب أحد هذه الروابط.</p>
        <p className="mk-404__en" lang="en" dir="ltr">We couldn’t find this page. It may have moved — try one of these.</p>
        <div className="mk-404__links">
          <Link href="/ar" className="mk-btn mk-btn--primary">الصفحة الرئيسية</Link>
          <Link href="/ar/listings" className="mk-btn mk-btn--outline">تصفّح العقارات</Link>
          <Link href="/ar/contact" className="mk-btn mk-btn--quiet">تواصل معنا</Link>
          <Link href="/en" className="mk-btn mk-btn--quiet" lang="en">English home</Link>
        </div>
      </div>
    </section>
  );
}

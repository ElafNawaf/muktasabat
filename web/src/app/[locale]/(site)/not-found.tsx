import Link from "next/link";

export default function SiteNotFound() {
  return (
    <section className="mk-section">
      <div className="mk-wrap mk-narrow mk-center">
        <h1 className="mk-h1">404</h1>
        <p className="mk-lead">الصفحة غير موجودة · Page not found</p>
        <Link href="/ar" className="mk-btn mk-btn--primary">الرئيسية</Link>{" "}
        <Link href="/en" className="mk-btn mk-btn--outline">Home</Link>
      </div>
    </section>
  );
}

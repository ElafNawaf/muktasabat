import Link from "next/link";

/** Switch between the self-service pages under My HR. */
export function SelfTabs({ locale, current }: { locale: string; current: "hr" | "file" | "pay" }) {
  const ar = locale === "ar";
  return (
    <nav className="self-tabs" aria-label={ar ? "خدماتي" : "My HR"}>
      <Link href={`/${locale}/my-hr`} className={current === "hr" ? "is-on" : ""} aria-current={current === "hr" ? "page" : undefined}>
        <span className="ms ms-sm" aria-hidden>event_available</span>{ar ? "الحضور والطلبات" : "Attendance & requests"}
      </Link>
      <Link href={`/${locale}/my-hr/file`} className={current === "file" ? "is-on" : ""} aria-current={current === "file" ? "page" : undefined}>
        <span className="ms ms-sm" aria-hidden>folder_shared</span>{ar ? "ملفي الوظيفي" : "My employee file"}
      </Link>
      <Link href={`/${locale}/my-hr/payslips`} className={current === "pay" ? "is-on" : ""} aria-current={current === "pay" ? "page" : undefined}>
        <span className="ms ms-sm" aria-hidden>payments</span>{ar ? "رواتبي" : "My pay"}
      </Link>
    </nav>
  );
}

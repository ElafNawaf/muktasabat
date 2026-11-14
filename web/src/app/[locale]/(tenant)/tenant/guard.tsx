import Link from "next/link";

import { ApiError } from "@/lib/api";
import { L } from "@/lib/owner";

/** Friendly panels for "pick a tenant to preview" and "account not linked". */
export async function load<T>(locale: string, fn: () => Promise<T>): Promise<{ data: T } | { error: React.ReactNode }> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      return {
        error: (
          <div className="ow-empty">
            <span className="ms">person_search</span>
            <p>{L(locale, "اختر مستأجراً من صفحة «وصول المستأجرين» لمعاينة بوابته.", "Pick a tenant on the Tenant access page to preview their portal.")}</p>
            <Link className="ow-btn" href={`/${locale}/tenant-access`}>{L(locale, "وصول المستأجرين", "Tenant access")}</Link>
          </div>
        ),
      };
    }
    if (e instanceof ApiError && e.status === 403) {
      return {
        error: (
          <div className="ow-empty">
            <span className="ms">lock</span>
            <p>{L(locale, "حسابك غير مرتبط بملف مستأجر بعد. تواصل معنا على 920007039.", "Your account isn't linked to a tenant profile yet. Please call us on 920007039.")}</p>
          </div>
        ),
      };
    }
    throw e;
  }
}

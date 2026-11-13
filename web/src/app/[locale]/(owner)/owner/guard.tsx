import Link from "next/link";

import { ApiError } from "@/lib/api";
import { L } from "@/lib/owner";

/** Turns API errors into a friendly panel instead of a crash page. */
export async function load<T>(locale: string, fn: () => Promise<T>): Promise<{ data: T } | { error: React.ReactNode }> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      return {
        error: (
          <div className="ow-empty">
            <span className="ms">person_search</span>
            <p>{L(locale, "اختر مالكاً من صفحة «وصول الملاك» لمعاينة بوابته.", "Pick an owner on the Owner access page to preview their portal.")}</p>
            <Link className="ow-btn" href={`/${locale}/owner-access`}>{L(locale, "وصول الملاك", "Owner access")}</Link>
          </div>
        ),
      };
    }
    if (e instanceof ApiError && e.status === 403) {
      return {
        error: (
          <div className="ow-empty">
            <span className="ms">lock</span>
            <p>{L(locale, "حسابك غير مرتبط بملف مالك بعد. تواصل مع مدير حسابك في مكتسبات.", "Your account isn't linked to an owner profile yet. Please contact your Muktasabat account manager.")}</p>
          </div>
        ),
      };
    }
    throw e;
  }
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

import { SupportClient } from "@/app/[locale]/(app)/support/SupportClient";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cms } from "@/lib/cms";
import { L } from "@/lib/owner";
import { tenantApi } from "@/lib/tenant";
import type { TicketStats, TicketSummary } from "@/lib/types";

/** Tenant portal → Help & support (tenants only see their own tickets). */
export default async function TenantSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string; as?: string }>;
}) {
  const { locale } = await params;
  const { new: openNew, as } = await searchParams;
  const me = await requireAuth(locale);
  // Staff preview (?as=<tenant id>): show that tenant's tickets and let staff open one under the tenant's account.
  const preview = me.role !== "tenant";
  if (preview && !as) {
    return <div className="ow-empty"><span className="ms">person_search</span><p>{L(locale, "اختر مستأجراً من صفحة «وصول المستأجرين» لمعاينة بوابته.", "Pick a tenant on the Tenant access page to preview their portal.")}</p></div>;
  }
  const tm = preview ? await tenantApi.me(locale, as).catch(() => null) : null;
  const requester = preview ? tm?.user_id ?? null : me.id;
  if (preview && !requester) {
    return (
      <div className="ow-empty">
        <span className="ms">no_accounts</span>
        <p>{L(locale, `ليس لـ${tm?.name ?? "هذا المستأجر"} حساب في البوابة بعد، لذلك لا يمكن فتح تذكرة دعم باسمه. امنحه الوصول من صفحة «وصول المستأجرين»، أو سجّل طلب صيانة له من صفحة الصيانة.`, `${tm?.name ?? "This tenant"} has no portal account yet, so a support ticket can't be filed under their name. Give them access on the Tenant access page, or log a maintenance request for them on the Maintenance page.`)}</p>
      </div>
    );
  }
  const [stats, tickets] = await Promise.all([
    api.get<TicketStats>(preview ? `/api/v1/support/stats?requester_id=${requester}` : "/api/v1/support/stats"),
    api.get<TicketSummary[]>(preview ? `/api/v1/support/tickets?scope=mine&requester_id=${requester}` : "/api/v1/support/tickets?scope=mine"),
  ]);
  const site = await cms.site().catch(() => null);
  const contact = site ? { phone: site.phone, whatsapp: site.whatsapp, email: site.email } : undefined;
  return (
    <div className="ow-embed">
      <SupportClient
        contact={contact}
        tickets={tickets}
        stats={stats}
        isStaff={false}
        meId={requester ?? me.id}
        locale={locale}
        openNew={openNew === "1"}
        base={`/${locale}/tenant`}
        onBehalf={preview && requester ? { userId: requester, name: tm?.name ?? "", qs: `?as=${as}` } : undefined}
      />
    </div>
  );
}

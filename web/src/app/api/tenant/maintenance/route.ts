import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Tenant: new maintenance request (fields + photos) → FastAPI. */
export async function POST(req: Request) {
  const as = new URL(req.url).searchParams.get("as_tenant");
  const qs = as && /^\d+$/.test(as) ? `?as_tenant=${as}` : "";
  const res = await proxyMultipart(req, `/api/v1/tenant-portal/maintenance${qs}`, 52 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]/(tenant)/tenant/maintenance", "layout");
  return res;
}

import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Tenant: new maintenance request (fields + photos) → FastAPI. */
export async function POST(req: Request) {
  const res = await proxyMultipart(req, "/api/v1/tenant-portal/maintenance", 52 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]/(tenant)/tenant/maintenance", "layout");
  return res;
}

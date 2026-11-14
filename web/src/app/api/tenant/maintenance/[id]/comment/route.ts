import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Tenant: comment (+ optional photos) on their maintenance request. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("Not found", { status: 404 });
  const res = await proxyMultipart(req, `/api/v1/tenant-portal/maintenance/${id}/comment`, 52 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]/(tenant)/tenant/maintenance", "layout");
  return res;
}

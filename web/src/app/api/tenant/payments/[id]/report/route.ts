import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Tenant: "I've paid" with receipt number + proof (PDF / image, 10 MB) → FastAPI. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ detail: "Bad id" }, { status: 400 });
  const res = await proxyMultipart(req, `/api/v1/tenant-portal/payments/${id}/report`, 11 * 1024 * 1024);
  if (res.ok) {
    revalidatePath("/[locale]/tenant", "layout");
    revalidatePath("/[locale]/payments", "page");
  }
  return res;
}

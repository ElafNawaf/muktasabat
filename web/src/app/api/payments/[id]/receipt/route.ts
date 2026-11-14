import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Payment evidence (bank receipt / transfer slip, PDF or image, 10 MB) → FastAPI. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return Response.json({ detail: "Bad id" }, { status: 400 });
  const res = await proxyMultipart(req, `/api/v1/payments/${id}/receipt`, 11 * 1024 * 1024);
  if (res.ok) {
    revalidatePath("/[locale]/payments", "page");
    revalidatePath("/[locale]/collections", "page");
  }
  return res;
}

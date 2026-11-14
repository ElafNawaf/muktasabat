import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Company logo for contract letterheads → FastAPI /hr/companies/{id}/logo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const res = await proxyMultipart(req, `/api/v1/hr/companies/${id}/logo`, 2.2 * 1024 * 1024);
  if (res.ok) {
    revalidatePath("/[locale]/(app)/org", "page");
    revalidatePath("/[locale]/(app)/hr", "page");
  }
  return res;
}

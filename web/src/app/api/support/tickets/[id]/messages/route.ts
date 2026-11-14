import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Reply on a ticket (text + optional attachment). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "Invalid ticket" }, { status: 400 });
  const res = await proxyMultipart(req, `/api/v1/support/tickets/${id}/messages`, 11 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]/(app)/support", "layout");
  return res;
}

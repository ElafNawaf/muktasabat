import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

/** CV download: FastAPI either streams the file (local storage) or returns a
 *  short-lived presigned S3 URL, which we redirect to. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/v1/cms/admin/applications/${id}/cv`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ detail: "Not available" }, { status: res.status });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const { url } = (await res.json()) as { url?: string };
    if (url && url.startsWith("https://")) return NextResponse.redirect(url);
    return NextResponse.json({ detail: "Not available" }, { status: 404 });
  }
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": ct || "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") || "attachment",
      "Cache-Control": "no-store",
    },
  });
}

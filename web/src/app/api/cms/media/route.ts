import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

/** Website editor image upload → FastAPI /cms/admin/media (auth + perms enforced there). */
export async function POST(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 9 * 1024 * 1024) return NextResponse.json({ detail: "Image must be 8 MB or smaller" }, { status: 413 });
  const form = await req.formData();
  const headers = await forwardHeaders();
  headers.delete("Content-Type");
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/v1/cms/admin/media`, { method: "POST", headers, body: form, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

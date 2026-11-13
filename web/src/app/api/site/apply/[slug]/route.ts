import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 6 * 1024 * 1024) return NextResponse.json({ detail: "File too large" }, { status: 413 });
  const form = await req.formData();
  const headers = await forwardHeaders();
  headers.delete("Content-Type"); // let fetch set the multipart boundary
  const res = await fetch(`${API_BASE}/api/v1/cms/public/jobs/${slug}/apply`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

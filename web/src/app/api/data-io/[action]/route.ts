import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

const ACTIONS = new Set(["validate", "apply"]);
const MAX_BYTES = 25 * 1024 * 1024;

/** Admin data management — forward the uploaded workbook to FastAPI validate / apply. */
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ detail: "Not found" }, { status: 404 });

  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ detail: "File is larger than 25 MB" }, { status: 413 });
  }

  const form = await req.formData();
  const headers = await forwardHeaders(req);
  headers.delete("Content-Type");
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/v1/data-io/${action}`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ detail: `Upload failed (${res.status})` }));
  return NextResponse.json(data, { status: res.status });
}

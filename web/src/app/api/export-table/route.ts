import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

/** Turns a table from the portal into a Muktasabat-branded Excel file (logo, colours) via FastAPI. */
export async function POST(req: Request) {
  const t = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!t) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const body = await req.text();
  if (body.length > 8_000_000) return NextResponse.json({ detail: "Too large" }, { status: 413 });
  const res = await fetch(`${API_BASE}/api/v1/exports/table.xlsx`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return NextResponse.json(d, { status: res.status });
  }
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") || "attachment",
      "Cache-Control": "no-store",
    },
  });
}

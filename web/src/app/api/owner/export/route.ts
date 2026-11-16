import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

const KINDS = new Set(["payments", "units", "expenses"]);

/** Owner-portal CSV exports (auth + owner scoping enforced by the API). */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const src = new URL(req.url).searchParams;
  const kind = src.get("kind") ?? "";
  if (!KINDS.has(kind)) return NextResponse.json({ detail: "Unknown export" }, { status: 404 });
  const p = new URLSearchParams();
  for (const k of ["locale", "as_owner"]) {
    const v = src.get(k);
    if (v && /^[a-z0-9]{1,8}$/i.test(v)) p.set(k, v);
  }
  const res = await fetch(`${API_BASE}/api/v1/owner-portal/export/${kind}.xlsx?${p}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ detail: "Not available" }, { status: res.status });
  return new NextResponse(res.body, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": res.headers.get("content-disposition") || `attachment; filename="muktasabat-${kind}.xlsx"`, "Cache-Control": "no-store" },
  });
}

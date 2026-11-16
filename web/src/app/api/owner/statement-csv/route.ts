import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

/** Statement CSV download (auth + owner scoping enforced by the API). */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const src = new URL(req.url).searchParams;
  const p = new URLSearchParams();
  for (const k of ["year", "month", "locale", "as_owner"]) {
    const v = src.get(k);
    if (v && /^[a-z0-9]{1,6}$/i.test(v)) p.set(k, v);
  }
  const res = await fetch(`${API_BASE}/api/v1/owner-portal/statement.xlsx?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ detail: "Not available" }, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": res.headers.get("content-disposition") || "attachment; filename=statement.xlsx",
      "Cache-Control": "no-store",
    },
  });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

export async function GET() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/v1/cms/admin/leads.csv`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ detail: "Forbidden" }, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=muktasabat-leads.csv",
      "Cache-Control": "no-store",
    },
  });
}

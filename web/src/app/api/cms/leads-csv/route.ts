import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

/** Website leads as a Muktasabat-branded Excel file (route name kept for old links). */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const locale = new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ar";
  const res = await fetch(`${API_BASE}/api/v1/cms/admin/leads.xlsx?locale=${locale}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ detail: "Forbidden" }, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": res.headers.get("content-disposition") || "attachment; filename=muktasabat-leads.xlsx",
      "Cache-Control": "no-store",
    },
  });
}

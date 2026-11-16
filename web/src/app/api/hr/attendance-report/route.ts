import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

/** Monthly attendance report as a branded Excel file — streamed from FastAPI with the user's token. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const month = u.searchParams.get("month") || "";
  const toMonth = u.searchParams.get("to_month") || "";
  const locale = u.searchParams.get("locale") === "en" ? "en" : "ar";
  if ((month && !/^\d{4}-\d{2}$/.test(month)) || (toMonth && !/^\d{4}-\d{2}$/.test(toMonth))) return NextResponse.json({ detail: "Bad month" }, { status: 400 });
  const t = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!t) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/v1/hr/attendance/report.xlsx?month=${month}${toMonth ? `&to_month=${toMonth}` : ""}&locale=${locale}`, {
    headers: { Authorization: `Bearer ${t}` },
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

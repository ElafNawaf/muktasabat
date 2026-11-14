import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";

const FILES = new Set(["wps.csv", "register.xlsx"]);

/** Payroll downloads (WPS salary file, payroll register) — streamed from FastAPI with the user's token. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  if (!/^\d+$/.test(id) || !FILES.has(file)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const t = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!t) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/v1/hr/payroll/runs/${id}/${file}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
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

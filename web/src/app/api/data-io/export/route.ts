import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

/** Admin data management — stream the Excel export (or ?template=1) from FastAPI. */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const template = sp.get("template") === "1";
  const sheets = (sp.get("sheets") ?? "").replace(/[^a-z_,]/g, "");
  const qs = new URLSearchParams();
  if (template) qs.set("template", "true");
  if (sheets) qs.set("sheets", sheets);
  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/v1/data-io/export${qs.toString() ? `?${qs}` : ""}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Export failed" }));
    return NextResponse.json(body, { status: res.status });
  }
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ?? 'attachment; filename="muktasabat-data.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

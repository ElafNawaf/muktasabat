import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";

/**
 * Serves files stored on the API's local upload volume (used when S3 is not
 * available) at https://muktasabat.com/uploads/… — the API container has no
 * public port, so Next.js proxies these reads.
 *
 * `private/…` (job-application CVs) is never served here; staff download CVs
 * through the authenticated /api/cms/cv/[id] route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const parts = path ?? [];
  if (
    parts.length === 0 ||
    parts[0] === "private" ||
    parts.some((p) => p === ".." || p === "." || p.includes("\\") || p.startsWith("."))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  const res = await fetch(`${API_BASE}/uploads/${parts.map(encodeURIComponent).join("/")}`, { cache: "no-store" });
  if (!res.ok || !res.body) return new NextResponse("Not found", { status: 404 });
  const type = res.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Documents (PDF/Word/Excel) download instead of rendering inline.
      ...(type.startsWith("image/") ? {} : { "Content-Disposition": "attachment" }),
    },
  });
}

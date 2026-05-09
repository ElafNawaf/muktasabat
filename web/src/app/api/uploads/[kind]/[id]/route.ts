import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

const KIND_TO_PATH: Record<string, string> = {
  buildings: "buildings",
  units: "units",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const path = KIND_TO_PATH[kind];
  if (!path) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Forward the incoming multipart body to FastAPI without buffering it ourselves.
  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${token}`);
  // Preserve the multipart boundary the browser set.
  headers.set("Content-Type", req.headers.get("content-type") ?? "application/octet-stream");

  const upstream = await fetch(`${API_BASE}/api/v1/${path}/${id}/images`, {
    method: "POST",
    headers,
    // Pass through the raw body. Next.js + Node 18+ handles ReadableStream forwarding.
    body: req.body,
    // @ts-expect-error — duplex is required when streaming a request body in fetch.
    duplex: "half",
    cache: "no-store",
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const path = KIND_TO_PATH[kind];
  if (!path) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

  const url = new URL(_req.url);
  const imageId = url.searchParams.get("image_id");
  if (!imageId) return NextResponse.json({ error: "Missing image_id" }, { status: 400 });

  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const headers = await forwardHeaders(_req);
  headers.set("Authorization", `Bearer ${token}`);

  const upstream = await fetch(
    `${API_BASE}/api/v1/${path}/${id}/images/${imageId}`,
    { method: "DELETE", headers, cache: "no-store" },
  );
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

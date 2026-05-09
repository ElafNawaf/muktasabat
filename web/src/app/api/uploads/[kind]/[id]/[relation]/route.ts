import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

/**
 * Multipart upload proxy: /api/uploads/{kind}/{id}/{relation}
 *
 * Maps the (kind, relation) pair to a FastAPI sub-resource:
 *
 *   buildings / images       → /buildings/{id}/images
 *   buildings / documents    → /buildings/{id}/documents
 *   units     / images       → /units/{id}/images
 *   contracts / attachments  → /contracts/{id}/attachments
 *
 * The DELETE handler reads `?id={subId}` (e.g. ?id=42) since the resource
 * being deleted is the sub-resource, not the parent.
 */

const ALLOWED: Record<string, Set<string>> = {
  buildings: new Set(["images", "documents"]),
  units: new Set(["images"]),
  contracts: new Set(["attachments"]),
};

function upstreamPath(kind: string, id: string, relation: string): string | null {
  if (!ALLOWED[kind]?.has(relation)) return null;
  return `${API_BASE}/api/v1/${kind}/${id}/${relation}`;
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ kind: string; id: string; relation: string }>;
  },
) {
  const { kind, id, relation } = await params;
  const target = upstreamPath(kind, id, relation);
  if (!target) {
    return NextResponse.json({ error: "Invalid upload target" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${token}`);
  // Preserve the multipart boundary the browser set.
  headers.set("Content-Type", req.headers.get("content-type") ?? "application/octet-stream");

  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body: req.body,
    // @ts-expect-error — duplex is required when streaming a request body in fetch.
    duplex: "half",
    cache: "no-store",
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

export async function DELETE(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ kind: string; id: string; relation: string }>;
  },
) {
  const { kind, id, relation } = await params;
  const target = upstreamPath(kind, id, relation);
  if (!target) {
    return NextResponse.json({ error: "Invalid upload target" }, { status: 400 });
  }

  const url = new URL(req.url);
  const subId = url.searchParams.get("id") ?? url.searchParams.get("image_id");
  if (!subId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${token}`);

  const upstream = await fetch(`${target}/${subId}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

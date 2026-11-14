import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "./api";
import { forwardHeaders } from "./forward";

/**
 * Forward a browser multipart POST to FastAPI with the user's bearer token.
 * `maxBytes` is a cheap early reject; FastAPI enforces the real limit.
 */
export async function proxyMultipart(req: Request, apiPath: string, maxBytes: number) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) {
    return NextResponse.json({ detail: "File is too large" }, { status: 413 });
  }

  const form = await req.formData();
  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${token}`);
  // Let fetch set the multipart boundary for the re-encoded body.
  headers.delete("Content-Type");

  const res = await fetch(`${API_BASE}${apiPath}`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

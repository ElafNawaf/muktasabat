/**
 * Build an outbound `Headers` object that forwards the real user's IP and
 * user-agent to the FastAPI backend, so its request-logging middleware sees
 * the real client instead of this Next.js container's IP.
 *
 * Caddy sets `X-Forwarded-For` automatically when reverse-proxying to us;
 * we just have to keep passing it down the chain.
 *
 *   - Inside a Route Handler, prefer `forwardHeaders(req)` (more explicit).
 *   - Inside a Server Component, call `forwardHeaders()` and we read from
 *     `next/headers` for you.
 */
import { headers as nextHeaders } from "next/headers";

const HEADERS_TO_FORWARD = ["x-forwarded-for", "x-real-ip", "user-agent"] as const;

export async function forwardHeaders(req?: Request): Promise<Headers> {
  const out = new Headers();

  if (req) {
    for (const name of HEADERS_TO_FORWARD) {
      const v = req.headers.get(name);
      if (v) out.set(name, v);
    }
    return out;
  }

  // Server component path — read from request-scoped headers store.
  const h = await nextHeaders();
  for (const name of HEADERS_TO_FORWARD) {
    const v = h.get(name);
    if (v) out.set(name, v);
  }
  return out;
}

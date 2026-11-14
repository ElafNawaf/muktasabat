import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** New support ticket (fields + optional attachment) → FastAPI /support/tickets. */
export async function POST(req: Request) {
  const res = await proxyMultipart(req, "/api/v1/support/tickets", 11 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]/(app)/support", "layout");
  return res;
}

import { revalidatePath } from "next/cache";

import { proxyMultipart } from "@/lib/multipart-proxy";

/** Profile photo upload → FastAPI /account/avatar (5 MB, jpeg/png/webp/gif). */
export async function POST(req: Request) {
  const res = await proxyMultipart(req, "/api/v1/account/avatar", 6 * 1024 * 1024);
  if (res.ok) revalidatePath("/[locale]", "layout");
  return res;
}

import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { CMS_TAG } from "@/lib/cms";

/** Purge the marketing-site ISR cache. Called by the deploy script right after
 *  a new web image starts (pages prerendered during `docker build` had no API
 *  to talk to). Protected by REVALIDATE_SECRET; disabled when it's unset. */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  revalidateTag(CMS_TAG);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

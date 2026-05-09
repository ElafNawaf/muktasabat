import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { REFRESH_COOKIE, TOKEN_COOKIE } from "@/lib/api";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
  return NextResponse.json({ ok: true });
}

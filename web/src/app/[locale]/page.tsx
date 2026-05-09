import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { TOKEN_COOKIE } from "@/lib/api";

export default async function LocaleRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE);
  redirect(`/${locale}/${token ? "dashboard" : "login"}`);
}

import { redirect } from "next/navigation";

/** Old address (emails already sent link here) → My HR › My employee file. */
export default async function MyFileRedirect({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? `?tab=${encodeURIComponent(sp.tab)}` : "";
  redirect(`/${locale}/my-hr/file${tab}`);
}

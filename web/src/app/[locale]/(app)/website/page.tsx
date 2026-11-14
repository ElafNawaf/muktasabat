import { redirect } from "next/navigation";

export default async function WebsiteIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/website/leads`);
}

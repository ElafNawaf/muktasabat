import { redirect } from "next/navigation";

export default async function PeopleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/hr?tab=employees`);
}

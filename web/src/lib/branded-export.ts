/** Download a table as a Muktasabat-branded Excel file (logo, maroon header, RTL). */
export type BrandedTable = {
  title: string;
  filename: string; // without extension; letters, digits, . _ -
  header: string[];
  rows: (string | number | boolean | null | undefined)[][];
  locale: string;
  details?: string;
};

export async function downloadBrandedTable(t: BrandedTable): Promise<boolean> {
  const res = await fetch("/api/export-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...t, locale: t.locale === "en" ? "en" : "ar", filename: t.filename.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) }),
  });
  if (!res.ok) return false;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

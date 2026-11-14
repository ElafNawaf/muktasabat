/** Shared list-filter helpers for entity pages. */

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function matchesSearch(
  haystack: (string | null | undefined)[],
  query: string,
): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return haystack
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/** English → Arabic names for places we commonly store from map lookups. */
const PLACE_AR: Record<string, string> = {
  riyadh: "الرياض", makkah: "مكة المكرمة", mecca: "مكة المكرمة", jeddah: "جدة", jiddah: "جدة", madinah: "المدينة المنورة", medina: "المدينة المنورة",
  dammam: "الدمام", khobar: "الخبر", "al khobar": "الخبر", dhahran: "الظهران", taif: "الطائف", "at taif": "الطائف", tabuk: "تبوك", abha: "أبها",
  buraydah: "بريدة", hail: "حائل", jazan: "جازان", najran: "نجران", "al kharj": "الخرج", kharj: "الخرج", diriyah: "الدرعية", "ad diriyah": "الدرعية",
  "khamis mushait": "خميس مشيط", yanbu: "ينبع", jubail: "الجبيل", "al jubail": "الجبيل", hofuf: "الهفوف", "al ahsa": "الأحساء", qatif: "القطيف",
  // Riyadh districts
  "al munsiyah": "المونسية", munsiyah: "المونسية", "al malqa": "الملقا", "al yasmin": "الياسمين", "al narjis": "النرجس", "an narjis": "النرجس",
  "al aqiq": "العقيق", "al sahafah": "الصحافة", "as sahafah": "الصحافة", "al nakheel": "النخيل", "an nakheel": "النخيل", "al olaya": "العليا", olaya: "العليا",
  "al sulimaniyah": "السليمانية", "as sulimaniyah": "السليمانية", "al wurud": "الورود", "al murooj": "المروج", "al mursalat": "المرسلات",
  "al nafel": "النفل", "an nafel": "النفل", hittin: "حطين", "al qirawan": "القيروان", "al arid": "العارض", "al rabi": "الربيع", "ar rabi": "الربيع",
  "al nada": "الندى", "an nada": "الندى", "al falah": "الفلاح", "al rimal": "الرمال", "ar rimal": "الرمال", "al qadisiyah": "القادسية",
  "al yarmuk": "اليرموك", "al rawdah": "الروضة", "ar rawdah": "الروضة", "al hamra": "الحمراء", "al naseem": "النسيم", "an naseem": "النسيم",
  "al malaz": "الملز", "al rawabi": "الروابي", "ar rawabi": "الروابي", "ishbiliyah": "إشبيلية", "qurtubah": "قرطبة", "granada": "غرناطة", "ghirnatah": "غرناطة",
  "al khaleej": "الخليج", "al andalus": "الأندلس", "al aziziyah": "العزيزية", "al shifa": "الشفا", "ash shifa": "الشفا", "al suwaidi": "السويدي", "as suwaidi": "السويدي",
  "al nuzhah": "النزهة", "an nuzhah": "النزهة", "al taawun": "التعاون", "at taawun": "التعاون", "al izdihar": "الازدهار", "al masif": "المصيف", "al ghadir": "الغدير",
  "al wadi": "الوادي", "al quds": "القدس", "al sulay": "السلي", "dhahrat laban": "ظهرة لبن", "al uraija": "العريجاء", "al badiah": "البديعة", "al janadriyah": "الجنادرية",
  "king abdullah": "الملك عبدالله", "king fahd": "الملك فهد", "king faisal": "الملك فيصل", "al mughrizat": "المغرزات", "al waha": "الواحة", "al muruj": "المروج",
};
const norm = (v: string) =>
  v.toLowerCase().replace(/\b(district|dist\.?|neighborhood|hayy|governorate|province|region)\b/g, "").replace(/[-_']/g, " ").replace(/\s+/g, " ").trim();
/** Arabic display for a place name that was only stored in English. */
export function placeAr(v?: string | null): string | null {
  if (!v) return v ?? null;
  if (/[\u0600-\u06FF]/.test(v)) return v;
  return PLACE_AR[norm(v)] ?? v;
}

export function localizedCity(
  b: { city?: string | null; city_en?: string | null; city_ar?: string | null },
  locale: string,
): string | null {
  if (locale.startsWith("ar")) return b.city_ar || placeAr(b.city);
  return b.city_en ?? b.city ?? null;
}

export function localizedDistrict(
  b: {
    district?: string | null;
    district_en?: string | null;
    district_ar?: string | null;
  },
  locale: string,
): string | null {
  if (locale.startsWith("ar")) return b.district_ar || placeAr(b.district);
  return b.district_en ?? b.district ?? null;
}

/** Custom (dynamic) form fields — shared by the form designer and the entity forms. */
export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox" | "phone" | "email" | "url";
export type CustomField = {
  key: string; label_ar: string; label_en?: string | null; type: FieldType; required: boolean;
  options: { value: string; ar: string; en?: string | null }[];
  help_ar?: string | null; help_en?: string | null; section_ar?: string | null; section_en?: string | null;
  archived?: boolean; order?: number;
};
export type FormEntity = "owner" | "tenant" | "building" | "unit" | "contract" | "agent";

export const FIELD_TYPES: Record<FieldType, { icon: string; ar: string; en: string; hint_ar: string; hint_en: string }> = {
  text: { icon: "short_text", ar: "نص قصير", en: "Short text", hint_ar: "اسم، رقم مرجعي، وصف قصير", hint_en: "A name, a reference, a short note" },
  textarea: { icon: "notes", ar: "نص طويل", en: "Long text", hint_ar: "ملاحظات وتفاصيل", hint_en: "Notes and details" },
  number: { icon: "pin", ar: "رقم", en: "Number", hint_ar: "مساحة، عدد، مبلغ", hint_en: "Area, count, amount" },
  date: { icon: "calendar_month", ar: "تاريخ", en: "Date", hint_ar: "تاريخ انتهاء، موعد", hint_en: "Expiry date, appointment" },
  select: { icon: "radio_button_checked", ar: "اختيار واحد", en: "Single choice", hint_ar: "قائمة خيارات يُختار منها واحد", hint_en: "Pick one from a list" },
  multiselect: { icon: "checklist", ar: "اختيار متعدد", en: "Multiple choice", hint_ar: "يمكن اختيار أكثر من خيار", hint_en: "Pick several" },
  checkbox: { icon: "check_box", ar: "نعم / لا", en: "Yes / no", hint_ar: "مربع اختيار", hint_en: "A tick box" },
  phone: { icon: "call", ar: "رقم جوال", en: "Phone", hint_ar: "يُتحقق من صيغة الرقم", hint_en: "Checked as a phone number" },
  email: { icon: "alternate_email", ar: "بريد إلكتروني", en: "Email", hint_ar: "يُتحقق من صيغة البريد", hint_en: "Checked as an email" },
  url: { icon: "link", ar: "رابط", en: "Link", hint_ar: "رابط يبدأ بـ https://", hint_en: "A web address" },
};

export const fieldLabel = (f: CustomField, locale: string) => (locale === "ar" ? f.label_ar : f.label_en || f.label_ar);
export function displayValue(f: CustomField, v: unknown, locale: string): string {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "—";
  const opt = (x: string) => {
    const o = f.options.find((o) => o.value === x);
    return o ? (locale === "ar" ? o.ar : o.en || o.ar) : x;
  };
  if (f.type === "checkbox") return v ? (locale === "ar" ? "نعم" : "Yes") : locale === "ar" ? "لا" : "No";
  if (f.type === "select") return opt(String(v));
  if (f.type === "multiselect") return (v as string[]).map(opt).join("، ");
  if (f.type === "date") return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium" }).format(new Date(String(v)));
  if (f.type === "number") return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(Number(v));
  return String(v);
}

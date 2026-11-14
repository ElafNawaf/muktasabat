/** Field definitions that drive the generic Website editor (ContentManager). */

export type CmsKind = "services" | "projects" | "posts" | "jobs" | "testimonials" | "partners";

export type FieldDef =
  | { name: string; label: [string, string]; type: "text" | "slug" | "icon" | "url"; required?: boolean; max?: number; hint?: [string, string] }
  | { name: string; label: [string, string]; type: "bi-text" | "bi-textarea" | "bi-markdown"; required?: boolean; max?: number }
  | { name: string; label: [string, string]; type: "number"; min?: number; max?: number; step?: number }
  | { name: string; label: [string, string]; type: "bool" }
  | { name: string; label: [string, string]; type: "date" }
  | { name: string; label: [string, string]; type: "select"; options: { value: string; label: [string, string] }[] }
  | { name: string; label: [string, string]; type: "image" }
  | { name: string; label: [string, string]; type: "gallery" }
  | { name: string; label: [string, string]; type: "latlng" };

/** [en, ar] */
const l = (en: string, ar: string): [string, string] => [en, ar];

const PUBLISH: FieldDef[] = [
  { name: "published", label: l("Published", "منشور"), type: "bool" },
  { name: "sort_order", label: l("Sort order", "الترتيب"), type: "number", min: -10000, max: 10000 },
];

export const KIND_META: Record<CmsKind, { title: [string, string]; icon: string; titleField: string; subtitleField?: string; publicPath?: string }> = {
  services: { title: l("Services", "الخدمات"), icon: "home_repair_service", titleField: "title", subtitleField: "summary", publicPath: "services" },
  projects: { title: l("Projects", "المشاريع"), icon: "location_city", titleField: "title", subtitleField: "city", publicPath: "projects" },
  posts: { title: l("News", "الأخبار"), icon: "newspaper", titleField: "title", subtitleField: "excerpt", publicPath: "news" },
  jobs: { title: l("Careers", "الوظائف"), icon: "work", titleField: "title", subtitleField: "department", publicPath: "careers" },
  testimonials: { title: l("Testimonials", "آراء العملاء"), icon: "format_quote", titleField: "name", subtitleField: "role" },
  partners: { title: l("Partners", "الشركاء"), icon: "handshake", titleField: "name" },
};

export const KIND_FIELDS: Record<CmsKind, FieldDef[]> = {
  services: [
    { name: "title", label: l("Title", "العنوان"), type: "bi-text", required: true, max: 200 },
    { name: "slug", label: l("URL slug", "الرابط"), type: "slug", required: true, hint: l("Lowercase English, e.g. property-management", "بالإنجليزية الصغيرة، مثل property-management") },
    { name: "icon", label: l("Icon", "الأيقونة"), type: "icon", hint: l("Material Symbols name, e.g. apartment", "اسم أيقونة Material Symbols مثل apartment") },
    { name: "summary", label: l("Short summary", "وصف مختصر"), type: "bi-textarea", max: 600 },
    { name: "body", label: l("Full description (Markdown)", "الوصف الكامل (Markdown)"), type: "bi-markdown" },
    { name: "image_url", label: l("Image", "الصورة"), type: "image" },
    ...PUBLISH,
  ],
  projects: [
    { name: "title", label: l("Title", "العنوان"), type: "bi-text", required: true, max: 200 },
    { name: "slug", label: l("URL slug", "الرابط"), type: "slug", required: true },
    {
      name: "category",
      label: l("Category", "التصنيف"),
      type: "select",
      options: [
        { value: "residential", label: l("Residential", "سكني") },
        { value: "commercial", label: l("Commercial", "تجاري") },
        { value: "development", label: l("Development", "تطوير") },
        { value: "mixed", label: l("Mixed-use", "متعدد الاستخدامات") },
        { value: "hospitality", label: l("Hospitality", "ضيافة") },
      ],
    },
    {
      name: "status",
      label: l("Status", "الحالة"),
      type: "select",
      options: [
        { value: "completed", label: l("Completed", "منجز") },
        { value: "ongoing", label: l("Ongoing", "قيد التنفيذ") },
        { value: "upcoming", label: l("Upcoming", "قادم") },
      ],
    },
    { name: "featured", label: l("Show on homepage", "عرض في الرئيسية"), type: "bool" },
    { name: "city", label: l("City", "المدينة"), type: "bi-text", max: 120 },
    { name: "summary", label: l("Short summary", "وصف مختصر"), type: "bi-textarea", max: 600 },
    { name: "body", label: l("Full description (Markdown)", "الوصف الكامل (Markdown)"), type: "bi-markdown" },
    { name: "area_sqm", label: l("Area (m²)", "المساحة (م²)"), type: "number", min: 0 },
    { name: "units_count", label: l("Units", "عدد الوحدات"), type: "number", min: 0 },
    { name: "year", label: l("Year", "السنة"), type: "number", min: 1950, max: 2100 },
    { name: "location", label: l("Map location", "الموقع على الخريطة"), type: "latlng" },
    { name: "cover_url", label: l("Cover image", "صورة الغلاف"), type: "image" },
    { name: "gallery", label: l("Gallery", "معرض الصور"), type: "gallery" },
    ...PUBLISH,
  ],
  posts: [
    { name: "title", label: l("Title", "العنوان"), type: "bi-text", required: true, max: 250 },
    { name: "slug", label: l("URL slug", "الرابط"), type: "slug", required: true },
    { name: "published_on", label: l("Publish date", "تاريخ النشر"), type: "date" },
    { name: "excerpt", label: l("Excerpt", "مقتطف"), type: "bi-textarea", max: 600 },
    { name: "body", label: l("Article (Markdown)", "المقال (Markdown)"), type: "bi-markdown" },
    { name: "cover_url", label: l("Cover image", "صورة الغلاف"), type: "image" },
    ...PUBLISH,
  ],
  jobs: [
    { name: "title", label: l("Job title", "المسمى الوظيفي"), type: "bi-text", required: true, max: 200 },
    { name: "slug", label: l("URL slug", "الرابط"), type: "slug", required: true },
    { name: "department", label: l("Department", "القسم"), type: "bi-text", max: 120 },
    { name: "location", label: l("Location", "الموقع"), type: "bi-text", max: 120 },
    {
      name: "employment_type",
      label: l("Type", "نوع الدوام"),
      type: "select",
      options: [
        { value: "full_time", label: l("Full-time", "دوام كامل") },
        { value: "part_time", label: l("Part-time", "دوام جزئي") },
        { value: "contract", label: l("Contract", "عقد") },
        { value: "internship", label: l("Internship", "تدريب") },
      ],
    },
    { name: "closes_on", label: l("Closing date", "آخر موعد"), type: "date" },
    { name: "body", label: l("Description (Markdown)", "الوصف (Markdown)"), type: "bi-markdown" },
    ...PUBLISH,
  ],
  testimonials: [
    { name: "name", label: l("Client name", "اسم العميل"), type: "bi-text", required: true, max: 120 },
    { name: "role", label: l("Role / company", "الصفة / الجهة"), type: "bi-text", max: 160 },
    { name: "quote", label: l("Quote", "الشهادة"), type: "bi-textarea", required: true, max: 1000 },
    { name: "rating", label: l("Rating (1–5)", "التقييم (1–5)"), type: "number", min: 1, max: 5 },
    { name: "avatar_url", label: l("Photo", "الصورة"), type: "image" },
    ...PUBLISH,
  ],
  partners: [
    { name: "name", label: l("Name", "الاسم"), type: "bi-text", required: true, max: 160 },
    { name: "website", label: l("Website", "الموقع الإلكتروني"), type: "url" },
    { name: "logo_url", label: l("Logo", "الشعار"), type: "image" },
    ...PUBLISH,
  ],
};

export const KIND_DEFAULTS: Record<CmsKind, Record<string, unknown>> = {
  services: { published: false, sort_order: 0 },
  projects: { published: false, sort_order: 0, category: "residential", status: "completed", featured: false, gallery: [] },
  posts: { published: false, sort_order: 0, published_on: new Date().toISOString().slice(0, 10) },
  jobs: { published: false, sort_order: 0, employment_type: "full_time" },
  testimonials: { published: false, sort_order: 0, rating: 5 },
  partners: { published: false, sort_order: 0 },
};

export const isKind = (k: string): k is CmsKind => k in KIND_META;

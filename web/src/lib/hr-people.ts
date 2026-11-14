// Types and labels for employee files, contracts, assets and the org chart (server + client safe).

type Pair = readonly [string, string];
export type Contract = {
  id: number; number: string; user_id: number; company_id?: number | null; company?: string | null; contract_type: string; job_title?: string | null;
  start_date: string; end_date?: string | null; probation_end?: string | null; working_hours_week?: number | null; annual_leave_days?: number | null;
  notice_days?: number | null; terms?: string | null; status: string; state: string; sent_at?: string | null; accepted_at?: string | null;
  accepted_name?: string | null; declined_note?: string | null; terminated_at?: string | null; termination_reason?: string | null; days_left?: number | null;
  basic_salary?: number; housing_allowance?: number; transport_allowance?: number; other_allowance?: number; other_allowance_label?: string | null;
  total_salary?: number; employee?: string;
  template_id?: number | null; has_body?: boolean; body_custom?: boolean; needs_signed?: boolean;
  signed_status?: "uploaded" | "verified" | "rejected" | null; signed_filename?: string | null; signed_uploaded_at?: string | null;
  signed_uploaded_by?: string | null; signed_reviewed_at?: string | null; signed_reviewed_by?: string | null; signed_note?: string | null;
  signed_digitally?: boolean; company_signed?: boolean; doc_hash?: string | null;
};
export type ContractDoc = Contract & {
  body?: string | null; company_name_ar?: string | null; company_name_en?: string | null; company_cr?: string | null; company_color?: string | null;
  is_self: boolean; can_review: boolean; can_upload_hr: boolean;
  company_logo_url?: string | null; company_is_holding?: boolean; company_code?: string | null;
  employee_signature?: string | null; company_signature?: string | null; company_signatory?: string | null; company_signed_at?: string | null;
};
export type ContractTemplate = {
  id: number; company_id?: number | null; company?: string | null; name: string; contract_type: string; body_ar: string; body_en?: string | null;
  probation_days: number; duration_months?: number | null; working_hours_week: number; annual_leave_days: number; notice_days: number;
  requires_signed_copy: boolean; is_default: boolean; active: boolean; updated_by?: string | null; updated_at?: string | null; used: number; unknown: string[];
};
export type Placeholder = { key: string; label: string; sample: string };
export type ContractsDesk = {
  contracts: Contract[];
  counts: { waiting_employee: number; signed_to_verify: number; missing_signed: number; drafts: number; no_contract: number };
  no_contract: { user_id: number; name: string }[];
};
export type Asset = {
  id: number; tag: string; company_id?: number | null; company?: string | null; kind: string; name: string; brand_model?: string | null; serial?: string | null;
  value?: number | null; purchase_date?: string | null; warranty_end?: string | null; status: string; assigned_user_id?: number | null; assigned_to?: string | null;
  assigned_at?: string | null; acknowledged_at?: string | null; condition?: string | null; notes?: string | null;
  events?: { at: string; actor?: string | null; action: string; note?: string | null; user?: string | null }[];
};
export type Family = { id: number; name: string; relation: string; date_of_birth?: string | null; id_number?: string | null; passport_number?: string | null; dependent: boolean; phone?: string | null; notes?: string | null };
export type EmpFile = {
  user: { id: number; name: string; name_ar?: string | null; name_en?: string | null; email: string; phone?: string | null; username: string; role: string };
  job: { employee_no?: string | null; job_title?: string | null; company_id?: number | null; company?: string | null; company_color?: string | null; department_id?: number | null;
    department?: string | null; manager_user_id?: number | null; manager?: string | null; hire_date?: string | null; employment_status: string; contract_type: string; work_mode: string; nationality?: string | null };
  personal: Record<string, string | null>;
  bank: { bank_name?: string | null; iban?: string | null; account_holder?: string | null; verified_at?: string | null; pending?: { bank_name?: string | null; iban?: string | null; account_holder?: string | null; at?: string | null } | null };
  family: Family[]; salary: Contract | null; salary_visible: boolean; contracts: Contract[]; assets: Asset[];
  returned_assets: { tag: string; name: string; kind: string; returned_at: string; note?: string | null }[];
  updated_at?: string | null; updated_by?: string | null; can?: { edit: boolean; approve: boolean };
};
export type Company = {
  id: number; name_ar: string; name_en?: string | null; name: string; short_code?: string | null; is_holding: boolean; parent_id?: number | null; cr_number?: string | null;
  color?: string | null; office_lat?: number | null; office_lng?: number | null; geofence_radius_m?: number | null; active: boolean; headcount: number;
  logo_url?: string | null; signatory_name?: string | null; signatory_title?: string | null; has_signature?: boolean;
  departments: { id: number; name_ar: string; name_en?: string | null; name: string; parent_id?: number | null; head_user_id?: number | null; head?: string | null; active: boolean; headcount: number }[];
};
export type OrgNode = { user_id: number; name: string; job_title?: string | null; manager_user_id?: number | null; company_id?: number | null; company?: string | null; company_color?: string | null; department_id?: number | null; department?: string | null; avatar_url?: string | null };

export const HP = {
  relation: { spouse: ["زوج / زوجة", "Spouse"], son: ["ابن", "Son"], daughter: ["ابنة", "Daughter"], father: ["أب", "Father"], mother: ["أم", "Mother"], brother: ["أخ", "Brother"], sister: ["أخت", "Sister"], other: ["أخرى", "Other"] } as Record<string, Pair>,
  marital: { single: ["أعزب / عزباء", "Single"], married: ["متزوج / متزوجة", "Married"], divorced: ["مطلق / مطلقة", "Divorced"], widowed: ["أرمل / أرملة", "Widowed"] } as Record<string, Pair>,
  gender: { male: ["ذكر", "Male"], female: ["أنثى", "Female"] } as Record<string, Pair>,
  idType: { national_id: ["هوية وطنية", "National ID"], iqama: ["إقامة", "Iqama"] } as Record<string, Pair>,
  ctype: { fixed: ["محدد المدة", "Fixed term"], unlimited: ["غير محدد المدة", "Open-ended"], part_time: ["دوام جزئي", "Part time"], temporary: ["مؤقت", "Temporary"] } as Record<string, Pair>,
  signed: { digital: ["موقّع إلكترونيًا", "Signed on screen"], uploaded: ["النسخة الموقعة بانتظار التحقق", "Signed copy to verify"], verified: ["النسخة الموقعة معتمدة", "Signed copy verified"], rejected: ["أُعيدت النسخة الموقعة", "Signed copy sent back"], missing: ["بانتظار النسخة الموقعة", "Signed copy missing"] } as Record<string, Pair>,
  cstate: { draft: ["مسودة", "Draft"], pending_acceptance: ["بانتظار موافقة الموظف", "Waiting for employee"], upcoming: ["يبدأ لاحقًا", "Starts later"], active: ["ساري", "Active"], expired: ["منتهي", "Expired"], terminated: ["منهي", "Ended"] } as Record<string, Pair>,
  akind: {
    laptop: ["حاسب محمول", "Laptop"], desktop: ["حاسب مكتبي", "Desktop"], phone: ["جوال", "Phone"], tablet: ["جهاز لوحي", "Tablet"], car: ["سيارة", "Car"], sim: ["شريحة اتصال", "SIM card"],
    cash: ["عهدة نقدية", "Cash custody"], card: ["بطاقة (وقود/مشتريات)", "Card (fuel/purchase)"], keys: ["مفاتيح", "Keys"], uniform: ["زي رسمي", "Uniform"], tools: ["عدد وأدوات", "Tools"], other: ["أخرى", "Other"],
  } as Record<string, Pair>,
  aicon: { laptop: "laptop_mac", desktop: "desktop_windows", phone: "smartphone", tablet: "tablet_mac", car: "directions_car", sim: "sim_card", cash: "payments", card: "credit_card", keys: "key", uniform: "checkroom", tools: "construction", other: "inventory_2" } as Record<string, string>,
  astatus: { in_stock: ["في المخزن", "In stock"], assigned: ["مسلّمة", "Assigned"], maintenance: ["في الصيانة", "In repair"], lost: ["مفقودة", "Lost"], retired: ["مستبعدة", "Retired"] } as Record<string, Pair>,
  cond: { new: ["جديد", "New"], good: ["جيد", "Good"], fair: ["مقبول", "Fair"], damaged: ["تالف", "Damaged"] } as Record<string, Pair>,
  expiring: { id: ["انتهاء الهوية / الإقامة", "ID / Iqama expiry"], passport: ["انتهاء الجواز", "Passport expiry"], contract: ["انتهاء عقد العمل", "Contract end"], probation: ["نهاية فترة التجربة", "Probation ends"], bank_change: ["طلب تغيير حساب بنكي", "Bank change request"] } as Record<string, Pair>,
};
export const BANKS = ["مصرف الراجحي", "البنك الأهلي السعودي", "بنك الرياض", "البنك السعودي الفرنسي", "البنك السعودي الأول (ساب)", "البنك العربي الوطني", "بنك البلاد", "بنك الجزيرة", "مصرف الإنماء", "بنك الخليج الدولي", "STC Bank", "D360"];

export function lb(ar: boolean, map: Record<string, Pair>, k?: string | null) {
  if (!k) return "—";
  return map[k]?.[ar ? 0 : 1] ?? k;
}

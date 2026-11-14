// Shared HR labels and types (server + client safe).

export type HrReq = {
  id: number; number: string; kind: "leave" | "permission" | "ticket"; status: string; user_id: number; employee: string;
  reason?: string | null; leave_type?: string | null; start_date?: string | null; end_date?: string | null; days?: number | null;
  delegate?: string | null; permission_type?: string | null; from_time?: string | null; to_time?: string | null; minutes?: number | null;
  ticket_purpose?: string | null; from_city?: string | null; to_city?: string | null; return_date?: string | null; round_trip?: boolean;
  travellers?: number; travel_class?: string | null; estimated_cost?: number | null; booking_ref?: string | null; actual_cost?: number | null;
  decided_by?: string | null; decided_at?: string | null; decision_note?: string | null; created_at: string; summary: string;
  warning?: string | null;
  events?: { at: string; actor?: string | null; action: string; note?: string | null }[];
  balance?: Balance;
};
export type Balance = { year: number; entitlement: number; used: number; pending: number; remaining: number; permission_minutes_month: number; permission_minutes_cap: number };
export type DayStatus = {
  day?: string; status: "present" | "late" | "absent" | "on_leave" | "weekend" | "not_yet" | "untracked";
  late_minutes: number; excused: boolean; worked_minutes: number | null; early_leave_minutes: number; leave_type?: string | null;
  check_in?: string | null; check_out?: string | null; source?: string | null; note?: string | null;
};

type Pair = readonly [string, string];
export const HR = {
  kind: { leave: ["إجازة", "Leave"], permission: ["استئذان", "Permission"], ticket: ["تذكرة سفر", "Travel ticket"] } as Record<string, Pair>,
  status: { pending: ["بانتظار الاعتماد", "Pending"], approved: ["معتمد", "Approved"], rejected: ["مرفوض", "Rejected"], cancelled: ["ملغى", "Cancelled"], booked: ["تم الحجز", "Booked"] } as Record<string, Pair>,
  leave: {
    annual: ["سنوية", "Annual"], sick: ["مرضية", "Sick"], emergency: ["اضطرارية", "Emergency"], unpaid: ["بدون راتب", "Unpaid"], hajj: ["حج", "Hajj"],
    marriage: ["زواج", "Marriage"], bereavement: ["وفاة", "Bereavement"], maternity: ["وضع", "Maternity"], paternity: ["مولود", "Paternity"], exam: ["اختبار", "Exam"], other: ["أخرى", "Other"],
  } as Record<string, Pair>,
  permission: { late_arrival: ["تأخر في الحضور", "Late arrival"], early_leave: ["خروج مبكر", "Early leave"], during_day: ["خروج أثناء الدوام", "During the day"] } as Record<string, Pair>,
  purpose: { annual_leave: ["إجازة سنوية", "Annual leave"], business: ["مهمة عمل", "Business trip"], exit_reentry: ["خروج وعودة", "Exit & re-entry"], other: ["أخرى", "Other"] } as Record<string, Pair>,
  day: {
    present: ["حاضر", "Present"], late: ["متأخر", "Late"], absent: ["غائب", "Absent"], on_leave: ["في إجازة", "On leave"],
    weekend: ["عطلة", "Weekend"], not_yet: ["لم يحضر بعد", "Not in yet"], untracked: ["قبل بدء التسجيل", "Not tracked"],
  } as Record<string, Pair>,
  action: {
    submitted: ["قُدّم الطلب", "Submitted"], filed_by_hr: ["سجّلته الموارد البشرية", "Filed by HR"], approved: ["اعتُمد", "Approved"],
    rejected: ["رُفض", "Rejected"], cancelled: ["أُلغي", "Cancelled"], booked: ["تم حجز التذكرة", "Ticket booked"],
  } as Record<string, Pair>,
  ticketEnt: { none: ["لا يوجد", "None"], annual: ["سنوية", "Every year"], biennial: ["كل سنتين", "Every two years"] } as Record<string, Pair>,
  cls: { economy: ["سياحية", "Economy"], business: ["رجال أعمال", "Business"], first: ["أولى", "First"] } as Record<string, Pair>,
  emp: { active: ["على رأس العمل", "Active"], probation: ["فترة تجربة", "Probation"], resigned: ["مستقيل", "Resigned"], terminated: ["منتهية خدمته", "Terminated"], excluded: ["ليس موظفًا (حساب نظام)", "Not an employee (system account)"] } as Record<string, Pair>,
  contract: { full_time: ["دوام كامل", "Full time"], part_time: ["دوام جزئي", "Part time"], contractor: ["متعاقد", "Contractor"] } as Record<string, Pair>,
  weekday: [["الاثنين", "Mon"], ["الثلاثاء", "Tue"], ["الأربعاء", "Wed"], ["الخميس", "Thu"], ["الجمعة", "Fri"], ["السبت", "Sat"], ["الأحد", "Sun"]] as Pair[],
};

export function hl(ar: boolean, map: Record<string, Pair>, k?: string | null) {
  if (!k) return "—";
  return map[k]?.[ar ? 0 : 1] ?? k;
}

export function statusClass(s: string) {
  return s === "approved" || s === "booked" ? "mx-status--completed" : s === "rejected" ? "mx-status--rejected" : s === "cancelled" ? "mx-status--cancelled" : "mx-status--awaiting_approval";
}

export function mins(n: number, ar: boolean) {
  const h = Math.floor(n / 60), m = n % 60;
  if (!h) return ar ? `${m} د` : `${m}m`;
  return ar ? `${h} س${m ? ` ${m} د` : ""}` : `${h}h${m ? ` ${m}m` : ""}`;
}

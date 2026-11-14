/** Client-safe maintenance types and labels (tenant / owner portals). */
export type WOEvent = { at: string; actor?: string | null; action: string; note?: string | null };
export type WOAttachment = { id: number; url: string; name?: string | null; content_type?: string | null; source: string; by?: string | null; at: string };
export type PortalWorkOrder = {
  id: number; number: string; title: string; description?: string | null; category: string; priority: string; status: string;
  building_id: number; building: string; unit_id?: number | null; unit?: string | null; owner?: string | null;
  reported_by: string; reporter_name?: string | null; vendor_name?: string | null;
  estimate_amount?: number | null; actual_cost?: number | null; charge_to?: string; approval_limit?: number | null; approval_required?: boolean;
  approved_by?: string | null; approved_at?: string | null; decision_note?: string | null;
  due_at?: string | null; scheduled_for?: string | null; started_at?: string | null; completed_at?: string | null; closed_at?: string | null;
  resolution?: string | null; rating?: number | null; created_at: string; updated_at: string; sla?: string;
  tenant_request?: null | { tenant_id: number; preferred_time?: string | null; allow_entry: boolean };
  events?: WOEvent[]; attachments?: WOAttachment[];
};
export type TenantUnit = { contract_id: number; unit_id: number; unit: string; building_id: number; building: string };

export const WO_STATUS: Record<string, [string, string, string]> = {
  new: ["تم الاستلام", "Received", "info"],
  assigned: ["قيد المراجعة", "Under review", "info"],
  awaiting_approval: ["بانتظار موافقة المالك", "Waiting for owner approval", "warn"],
  approved: ["معتمد — بانتظار التنفيذ", "Approved — scheduling", "ok"],
  rejected: ["لم تتم الموافقة", "Not approved", "bad"],
  in_progress: ["قيد التنفيذ", "In progress", "info"],
  completed: ["مُنجز — بانتظار تأكيدك", "Done — please confirm", "ok"],
  closed: ["مغلق", "Closed", "ok"],
  cancelled: ["ملغى", "Cancelled", "muted"],
};
export const WO_CATEGORY: Record<string, [string, string, string]> = {
  plumbing: ["سباكة", "Plumbing", "plumbing"], electrical: ["كهرباء", "Electrical", "electrical_services"], ac: ["تكييف", "A/C", "ac_unit"],
  carpentry: ["نجارة وأبواب", "Carpentry & doors", "door_front"], painting: ["دهانات", "Painting", "format_paint"], cleaning: ["نظافة", "Cleaning", "cleaning_services"],
  pest: ["مكافحة حشرات", "Pest control", "pest_control"], appliances: ["أجهزة", "Appliances", "kitchen"], structural: ["تشققات وإنشائي", "Cracks & structure", "foundation"],
  elevator: ["مصعد", "Elevator", "elevator"], fire_safety: ["سلامة وحريق", "Fire safety", "fire_extinguisher"], other: ["أخرى", "Other", "build"],
};
export const WO_ACTION: Record<string, [string, string, string]> = {
  created: ["تم رفع الطلب", "Request raised", "add_task"],
  assigned: ["استلمه فريق الصيانة", "Picked up by the maintenance team", "engineering"],
  estimated: ["قُدّرت التكلفة", "Cost estimated", "request_quote"],
  approval_requested: ["أُرسل للمالك للموافقة", "Sent to the owner for approval", "how_to_reg"],
  auto_approved: ["معتمد ضمن صلاحيات الإدارة", "Approved within our authority", "verified"],
  approved: ["وافق المالك", "Approved", "task_alt"],
  rejected: ["لم تتم الموافقة", "Not approved", "block"],
  started: ["بدأ التنفيذ", "Work started", "construction"],
  completed: ["اكتمل العمل", "Work completed", "verified"],
  expense_posted: ["سُجّلت التكلفة في كشف الحساب", "Cost added to your statement", "receipt_long"],
  closed: ["أُغلق الطلب", "Closed", "lock"],
  cancelled: ["أُلغي الطلب", "Cancelled", "cancel"],
  reply: ["ردّ فريق الصيانة", "Maintenance team replied", "forum"],
  tenant_note: ["تعليق المستأجر", "Tenant comment", "chat"],
  owner_note: ["تعليق المالك", "Owner comment", "chat"],
  tenant_confirmed: ["أكّد المستأجر الإصلاح", "Tenant confirmed the fix", "thumb_up"],
  reopened: ["أعاد المستأجر فتح الطلب", "Tenant reopened the request", "replay"],
};

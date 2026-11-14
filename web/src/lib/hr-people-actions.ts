"use server";

import { revalidatePath } from "next/cache";

import { api, ApiError } from "./api";

export type R<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    const data = await fn();
    revalidatePath("/[locale]/(app)/my-hr/file", "page");
    revalidatePath("/[locale]/(app)/hr/people/[id]", "page");
    revalidatePath("/[locale]/(app)/hr", "page");
    revalidatePath("/[locale]/(app)/org", "page");
    revalidatePath("/[locale]/(app)/my-hr/contracts/[id]", "page");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError) {
      const d = (e.body as { detail?: unknown } | undefined)?.detail;
      if (typeof d === "string") return { ok: false, error: d };
      if (Array.isArray(d) && d[0]?.msg) return { ok: false, error: String(d[0].msg).replace(/^Value error, /, "") };
      return { ok: false, error: `Error ${e.status}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const B = "/api/v1/hr";
type Body = Record<string, unknown>;
// self
export async function meSavePersonal(b: Body) { return call(() => api.put(`${B}/me/personal`, b)); }
export async function meRequestBank(b: Body) { return call(() => api.put(`${B}/me/bank`, b)); }
export async function meCancelBank() { return call(() => api.delete(`${B}/me/bank/pending`)); }
export async function meAddFamily(b: Body) { return call(() => api.post(`${B}/me/family`, b)); }
export async function meEditFamily(id: number, b: Body) { return call(() => api.put(`${B}/me/family/${id}`, b)); }
export async function meDeleteFamily(id: number) { return call(() => api.delete(`${B}/me/family/${id}`)); }
export async function meRespondContract(id: number, b: Body) { return call(() => api.post(`${B}/me/contracts/${id}/respond`, b)); }
export async function meAckAsset(id: number) { return call(() => api.post(`${B}/me/assets/${id}/acknowledge`, {})); }
// HR
export async function hrSavePersonal(uid: number, b: Body) { return call(() => api.put(`${B}/people/${uid}/personal`, b)); }
export async function hrSetBank(uid: number, b: Body) { return call(() => api.put(`${B}/people/${uid}/bank`, b)); }
export async function hrBankDecision(uid: number, approve: boolean) { return call(() => api.post(`${B}/people/${uid}/bank/decision?approve=${approve}`, {})); }
export async function hrAddFamily(uid: number, b: Body) { return call(() => api.post(`${B}/people/${uid}/family`, b)); }
export async function hrEditFamily(uid: number, id: number, b: Body) { return call(() => api.put(`${B}/people/${uid}/family/${id}`, b)); }
export async function hrDeleteFamily(uid: number, id: number) { return call(() => api.delete(`${B}/people/${uid}/family/${id}`)); }
export async function hrCreateContract(b: Body) { return call(() => api.post(`${B}/contracts`, b)); }
export async function hrEditContract(id: number, b: Body) { return call(() => api.put(`${B}/contracts/${id}`, b)); }
export async function hrSendContract(id: number) { return call(() => api.post(`${B}/contracts/${id}/send`, {})); }
export async function hrTerminateContract(id: number, b: Body) { return call(() => api.post(`${B}/contracts/${id}/terminate`, b)); }
export async function hrDeleteContract(id: number) { return call(() => api.delete(`${B}/contracts/${id}`)); }
export async function hrCreateAsset(b: Body) { return call(() => api.post(`${B}/assets`, b)); }
export async function hrEditAsset(id: number, b: Body) { return call(() => api.put(`${B}/assets/${id}`, b)); }
export async function hrGetAsset(id: number, locale: string) { return call(() => api.get(`${B}/assets/${id}?locale=${locale}`)); }
export async function hrAssignAsset(id: number, b: Body) { return call(() => api.post(`${B}/assets/${id}/assign`, b)); }
export async function hrReturnAsset(id: number, b: Body) { return call(() => api.post(`${B}/assets/${id}/return`, b)); }
export async function hrSaveCompany(id: number | null, b: Body) { return call(() => (id ? api.put(`${B}/companies/${id}`, b) : api.post(`${B}/companies`, b))); }
export async function hrSaveDepartment(id: number | null, b: Body) { return call(() => (id ? api.put(`${B}/departments/${id}`, b) : api.post(`${B}/departments`, b))); }
export async function hrSetReporting(uid: number, b: Body) { return call(() => api.put(`${B}/org/${uid}`, b)); }
// contract templates & signed copies
export async function hrSaveTemplate(id: number | null, b: Body) { return call(() => (id ? api.put(`${B}/contract-templates/${id}`, b) : api.post(`${B}/contract-templates`, b))); }
export async function hrDuplicateTemplate(id: number, companyId?: number | null) { return call(() => api.post(`${B}/contract-templates/${id}/duplicate${companyId ? `?company_id=${companyId}` : ""}`, {})); }
export async function hrDeleteTemplate(id: number) { return call(() => api.delete(`${B}/contract-templates/${id}`)); }
export type PreviewCompany = { name_ar: string; name_en?: string | null; cr?: string | null; color?: string | null; logo_url?: string | null; is_holding?: boolean; code?: string | null; signatory?: string | null; signature?: string | null };
export async function hrPreviewTemplate(b: Body) { return call(() => api.post<{ text: string; unknown: string[]; company: PreviewCompany | null }>(`${B}/contract-templates/preview`, b)); }
export async function hrMatchTemplate(companyId: number | null, type: string) { return call(() => api.get<{ id: number | null }>(`${B}/contract-templates/match?contract_type=${type}${companyId ? `&company_id=${companyId}` : ""}`)); }
export async function hrBulkIssue(b: Body) { return call(() => api.post<{ created: { user_id: number; name: string; contract_id: number; number: string }[]; sent: { contract_id: number }[]; incomplete: { name: string; number: string }[]; skipped: { name?: string; reason: string }[] }>(`${B}/contracts/bulk`, b)); }
export async function hrReviewSigned(id: number, b: Body) { return call(() => api.post(`${B}/contracts/${id}/signed/review`, b)); }
export async function hrRefresh() { return call(async () => true); }
export async function hrListTemplates() { return call(() => api.get<{ templates: unknown[] }>(`${B}/contract-templates`)); }
export async function hrContractDoc(id: number) { return call(() => api.get<{ body?: string | null }>(`${B}/contracts/${id}/document`)); }
export async function hrGetSignatory(cid: number) { return call(() => api.get<{ signatory_name?: string | null; signatory_title?: string | null; signature?: string | null }>(`${B}/companies/${cid}/signatory`)); }
export async function hrSetSignatory(cid: number, b: Body) { return call(() => api.put(`${B}/companies/${cid}/signatory`, b)); }
export async function hrDeleteLogo(cid: number) { return call(() => api.delete(`${B}/companies/${cid}/logo`)); }

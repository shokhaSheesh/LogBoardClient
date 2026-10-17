import { api } from "./api";

// Compensation requests: money a carrier asks a broker for on top of the rate — TONU,
// detention, layover, extra miles — kept with their status so none is forgotten.
//
// Server: /compensations (docs/API.md → Compensations). The list answers one page, the total,
// and the per-status summary for the cards, which ignores the status filter so choosing one
// never empties the other cards.

export type CompType = "tonu" | "detention" | "layover" | "extra_mile";
export type CompStatus = "pending" | "paid" | "not_approved";

export const COMP_TYPES: { value: CompType; label: string }[] = [
  { value: "tonu", label: "TONU" },
  { value: "detention", label: "Detention" },
  { value: "layover", label: "Layover" },
  { value: "extra_mile", label: "Extra Mile" },
];

export const COMP_STATUSES: { value: CompStatus; label: string; color: string; bg: string }[] = [
  { value: "pending", label: "Pending", color: "var(--caution)", bg: "var(--caution-soft)" },
  { value: "paid", label: "Paid", color: "var(--primary)", bg: "var(--primary-soft)" },
  { value: "not_approved", label: "Not Approved", color: "#DC2626", bg: "rgba(239,68,68,0.12)" },
];

export const compType = (t: CompType) => COMP_TYPES.find((x) => x.value === t)?.label ?? t;
export const compStatus = (s: CompStatus) => COMP_STATUSES.find((x) => x.value === s) ?? COMP_STATUSES[0];

export interface Compensation {
  id: string;
  loadId: string;       // the load's id in Brelo
  loadRef: string;      // its load number, as the broker knows it
  broker: string;
  type: CompType;
  status: CompStatus;
  amount: number | null; // the broker decides it, so it's often unknown until they pay
  requestedAt: string;  // YYYY-MM-DD: the day it was asked for
  comment: string;
}

export type CompInput = Omit<Compensation, "id">;

export interface CompSummary { count: number; amount: number }
export interface CompList {
  items: Compensation[];
  total: number;
  summary: Record<CompStatus, CompSummary>;
}

export interface CompQuery {
  q?: string; type?: CompType; status?: CompStatus;
  from?: string; to?: string; page: number; pageSize: number;
}

// ─── Server ───────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toComp = (b: any): Compensation => ({
  id: b.id,
  loadId: b.load_id ?? "",
  loadRef: b.load_ref ?? "",
  broker: b.broker ?? "",
  type: b.type,
  status: b.status,
  amount: b.amount ?? null,
  requestedAt: b.requested_at ?? "",
  comment: b.comment ?? "",
});

const toBody = (c: CompInput) => ({
  load_id: c.loadId,
  type: c.type,
  status: c.status,
  amount: c.amount,
  requested_at: c.requestedAt,
  comment: c.comment,
});

const EMPTY: CompSummary = { count: 0, amount: 0 };

export async function listCompensations(q: CompQuery): Promise<CompList> {
  const { items, total, stats } = await api.getList<any>("/compensations", {
    q: q.q || undefined, type: q.type, status: q.status,
    from: q.from, to: q.to, page: q.page, page_size: q.pageSize,
  });
  const s = (stats ?? {}) as Partial<Record<CompStatus, CompSummary>>;
  return {
    items: items.map(toComp),
    total,
    summary: { pending: s.pending ?? EMPTY, paid: s.paid ?? EMPTY, not_approved: s.not_approved ?? EMPTY },
  };
}

export const createCompensation = async (input: CompInput) => toComp(await api.post<any>("/compensations", toBody(input)));
export const updateCompensation = async (id: string, input: CompInput) => toComp(await api.put<any>(`/compensations/${id}`, toBody(input)));
export const deleteCompensation = async (id: string) => { await api.delete(`/compensations/${id}`); };

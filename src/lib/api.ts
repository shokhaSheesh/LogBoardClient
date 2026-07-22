const BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8080") + "/api/v1";

// Carries the backend's machine-readable error code (e.g. "invalid_truck",
// "truck_assigned") alongside the human message, so callers can map specific
// errors to specific form fields instead of just showing a toast.
export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// A permission failure — the caller lacks the required key for this endpoint.
// Used to tell "you can't see this list" apart from "this list is empty".
export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.code === "forbidden");
}

// ─── Entitlement (the plan gate) ─────────────────────────────────────────────
//
// A board caller is cut off from every tenant route unless their company is
// currently entitled — it has a plan, status Active, and an unexpired period.
// These 403s are not the user doing anything wrong, so they must not surface as
// "Update failed" toasts; the app tells them what happened and who can fix it.
//
// Three of them are total: reads 403 as well, so the whole workspace is dead.
// grace_read_only is different — the board still READS for 7 days after the last
// subscription lapses, and only writes are refused.
export type EntitlementCode =
  | "plan_required"
  | "company_suspended"
  | "subscription_expired"
  | "grace_read_only";

const ENTITLEMENT_CODES = new Set<string>([
  "plan_required", "company_suspended", "subscription_expired", "grace_read_only",
]);

export function entitlementCode(e: unknown): EntitlementCode | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  return e.code && ENTITLEMENT_CODES.has(e.code) ? (e.code as EntitlementCode) : null;
}

// The gate can trip on ANY request, from any page, so it can't be handled at a call
// site. Requests announce it here and the layout renders the block screen / banner.
type EntitlementListener = (code: EntitlementCode, message: string) => void;
const entitlementListeners = new Set<EntitlementListener>();

export function onEntitlementError(fn: EntitlementListener): () => void {
  entitlementListeners.add(fn);
  return () => entitlementListeners.delete(fn);
}

// Every failed response goes through here, so the gate is caught no matter which
// helper (request / requestList / requestPayouts / upload) made the call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apiError(json: any, status: number): ApiError {
  const msg = json?.error?.message ?? json?.error ?? `HTTP ${status}`;
  const err = new ApiError(msg, json?.error?.code, status);
  const code = entitlementCode(err);
  if (code) entitlementListeners.forEach((fn) => fn(code, err.message));
  return err;
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function setToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("auth_token");
}

export function getCompanyId(): string {
  return localStorage.getItem("active_company_id") ?? "";
}

export function setCompanyId(id: string): void {
  localStorage.setItem("active_company_id", id);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));

  if (!res.ok) throw apiError(json, res.status);

  // All success responses are wrapped: { "data": ... }
  return (json.data ?? json) as T;
}

// Builds a URL with query params, dropping undefined/empty values
function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

// For paginated list endpoints that return { data: [...], total: N }
async function requestList<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<{ items: T[]; total: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const res = await fetch(`${BASE}${buildUrl(path, params)}`, { method: "GET", headers });

  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (res.status === 204) return { items: [], total: 0 };

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(json, res.status);

  const data = json.data ?? json;
  const items = Array.isArray(data) ? data : [];
  const total = json.meta?.total ?? json.total ?? items.length;
  return { items, total };
}

async function requestPayouts<T>(
  params?: Record<string, string | number | undefined>
): Promise<{ items: T[]; total: number; totals: { rate: number; added: number; deducted: number; net: number } }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const res = await fetch(`${BASE}${buildUrl("/payouts", params)}`, { method: "GET", headers });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (res.status === 204) return { items: [], total: 0, totals: { rate: 0, added: 0, deducted: 0, net: 0 } };

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(json, res.status);

  return {
    items: Array.isArray(json.data) ? json.data : [],
    total: json.meta?.total ?? 0,
    totals: json.totals ?? { rate: 0, added: 0, deducted: 0, net: 0 },
  };
}

// Multipart upload (e.g. CSV bulk import). Do NOT set Content-Type — the browser
// adds the multipart boundary itself.
async function upload<T>(path: string, file: File, field = "file"): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const fd = new FormData();
  fd.append(field, file);

  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: fd });

  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }

  const json = await res.json().catch(() => ({}));
  // Carries the machine-readable code (file_too_large, unsupported_media_type,
  // not_configured, ai_unavailable, …) so callers can map it to a specific message.
  if (!res.ok) throw apiError(json, res.status);
  return (json.data ?? json) as T;
}

// Fetch a binary payload (a generated PDF, say) with the same auth/company headers as
// every other call. It can't go through request<T>() — that parses JSON — and it can't
// be a plain <a href> either, because auth rides in a header rather than a cookie, so a
// direct link would just 401.
async function getBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers["X-Company-ID"] = companyId;

  const res = await fetch(`${BASE}${path}`, { method: "GET", headers });

  if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }
  // A failure on a binary route still comes back as the usual JSON error envelope.
  if (!res.ok) throw apiError(await res.json().catch(() => ({})), res.status);

  return res.blob();
}

// Fetch a binary route and save it to disk under `filename`. Uses getBlob (so the auth
// headers ride along) and hands the browser an object URL, revoked after a delay —
// revoking synchronously can cancel the download mid-flight.
async function download(path: string, filename: string): Promise<void> {
  const blob = await getBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  getBlob,
  download,
  upload,
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  getList: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    requestList<T>(path, params),
  getPayouts: <T>(params?: Record<string, string | number | undefined>) =>
    requestPayouts<T>(params),
};

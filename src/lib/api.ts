const BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8080") + "/api/v1";

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

  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

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
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

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
  if (!res.ok) { throw new Error(json?.error?.message ?? json?.error ?? `HTTP ${res.status}`); }

  return {
    items: Array.isArray(json.data) ? json.data : [],
    total: json.meta?.total ?? 0,
    totals: json.totals ?? { rate: 0, added: 0, deducted: 0, net: 0 },
  };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  getList: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    requestList<T>(path, params),
  getPayouts: <T>(params?: Record<string, string | number | undefined>) =>
    requestPayouts<T>(params),
};

// Shared WebSocket helpers for the realtime board.

// The API host with the ws:// / wss:// scheme (matches the http/https of VITE_API_BASE).
export function getWsBase(): string {
  const base = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
  return base.replace(/^https/, "wss").replace(/^http/, "ws");
}

// URL for a company's board websocket (carries snapshots, history, locks, presence).
export function boardWsUrl(companyId: string): string {
  const token = localStorage.getItem("auth_token") ?? "";
  return `${getWsBase()}/api/v1/ws/boards/${companyId}?token=${encodeURIComponent(token)}&company_id=${encodeURIComponent(companyId)}`;
}

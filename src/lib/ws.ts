// Shared WebSocket helpers for the realtime board.

// The API host with the ws:// / wss:// scheme (matches the http/https of VITE_API_BASE).
export function getWsBase(): string {
  const base = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
  return base.replace(/^https/, "wss").replace(/^http/, "ws");
}

// URL for a board websocket (carries snapshots, history, locks, presence).
//
// `boardId` is the realtime scope, NOT the company id: "all" for the whole-company
// board, or a team id for one dispatch pod. The backend only pushes snapshots on
// these two — a socket opened on the company id (as this used to do) connects but
// never receives a board.snapshot, which is why the board went stale until a manual
// refetch. The company still travels as the company_id query param for auth/tenancy.
export function boardWsUrl(boardId: string, companyId: string): string {
  const token = localStorage.getItem("auth_token") ?? "";
  return `${getWsBase()}/api/v1/ws/boards/${boardId}?token=${encodeURIComponent(token)}&company_id=${encodeURIComponent(companyId)}`;
}

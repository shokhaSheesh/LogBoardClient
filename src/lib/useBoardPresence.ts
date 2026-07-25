import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { boardWsUrl } from "./ws";

export interface OnlineUser { id: string; name: string; role: string }

// Live "who's online" for the active company's board — seeds from GET /board/online,
// then tracks the board.presence websocket event ({ count, users } pushed on every
// connect/disconnect). A live board WS connection is exactly what makes the current
// user count as online, so holding this open app-wide keeps the header badge honest
// even off the board page. Reconnects with backoff, like the board's own socket.
export function useBoardPresence(companyId: string): { count: number; users: OnlineUser[] } {
  const [count, setCount] = useState(0);
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(2000);

  useEffect(() => {
    if (!companyId) { setCount(0); setUsers([]); return; }
    let active = true;

    // Immediate count from REST so the badge isn't empty until the first WS push.
    api.get<{ count: number; users: OnlineUser[] }>("/board/online")
      .then((d) => { if (active) { setCount(d?.count ?? 0); setUsers(d?.users ?? []); } })
      .catch(() => {});

    const connect = () => {
      const ws = new WebSocket(boardWsUrl("all", companyId));
      wsRef.current = ws;
      ws.onopen = () => { backoff.current = 2000; };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "board.presence") {
            setCount(msg.count ?? 0);
            setUsers(msg.users ?? []);
          }
        } catch { /* ignore malformed / non-presence frames */ }
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return; // superseded by a newer connect
        wsRef.current = null;
        const delay = backoff.current;
        backoff.current = Math.min(backoff.current * 2, 30_000);
        reconnectRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      active = false;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [companyId]);

  return { count, users };
}

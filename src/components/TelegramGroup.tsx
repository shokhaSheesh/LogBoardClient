import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Send } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { fmtDate, fmtDateTime } from "../lib/dates";
import { friendlyError, notify } from "./feedback";

// A driver's Telegram group, and posting a load to it. The bot does the posting; these two
// are the app's side: the group card on a driver, and the send button on a load.
//
// Both are extras on their page. If the server has no answer for them (the bot isn't
// switched on, or the role can't see it), they draw nothing rather than an error.

const card: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 };
const title: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const note: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 };
const cap: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 500, color: "var(--muted-foreground)" };
const btn = (primary: boolean, busy: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8,
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  border: primary ? "none" : "1px solid var(--border)", backgroundColor: primary ? "var(--primary)" : "var(--card)", color: primary ? "var(--primary-foreground)" : "var(--foreground)",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

// ─── On a driver ──────────────────────────────────────────────────────────────

// Which Telegram group this driver's trips are posted to. Connecting one is done in
// Telegram, in the group itself — the bot is added there and someone types /assign with the
// driver's name — so this card only shows what is connected and says how to connect. It
// asks again when the window is returned to, since that is where the person has just been.
export function DriverTelegramGroup({ driverId, driverName }: { driverId: string; driverName: string }) {
  const { user } = useAuth();
  const canChange = hasPerm(user, "drivers", "update");
  const [group, setGroup] = useState<{ connected: boolean; title: string; linkedAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let gone = false;
    const read = () => api.get<Raw>(`/drivers/${driverId}/telegram-group`)
      .then((g) => { if (!gone) setGroup({ connected: !!g?.connected, title: g?.title ?? "", linkedAt: g?.linked_at ?? "" }); })
      .catch(() => { if (!gone) setGroup(null); });
    void read();
    const back = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { gone = true; document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [driverId]);

  if (!group) return null;

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.delete(`/drivers/${driverId}/telegram-group`);
      setGroup({ connected: false, title: "", linkedAt: "" });
      notify.success("Group disconnected");
    } catch (e) {
      notify.error(friendlyError(e, "Couldn't disconnect the group."));
    } finally {
      setBusy(false); setConfirming(false);
    }
  };

  const code: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" };
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Send size={15} style={{ color: group.connected ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={cap}>Telegram group</div>
          <div style={title}>{group.connected ? group.title || "Connected" : "Not connected"}</div>
        </div>
      </div>
      {group.connected ? (
        <div style={note}>Trips are posted here · since {fmtDate(group.linkedAt)}</div>
      ) : (
        <div style={note}>
          To connect: add the Brelo bot to the group you share with this driver, then type <span style={code}>/assign {driverName}</span> there.
        </div>
      )}
      {canChange && group.connected && (
        confirming ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={note}>Trips for {driverName} will no longer be posted there. The bot stays in the chat.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirming(false)} disabled={busy} style={{ ...btn(false, busy), flex: 1 }}>Keep it</button>
              <button onClick={disconnect} disabled={busy} style={{ ...btn(false, busy), flex: 1, color: "#DC2626", borderColor: "rgba(220,38,38,0.4)" }}>Disconnect</button>
            </div>
          </div>
        ) : <button onClick={() => setConfirming(true)} disabled={busy} style={btn(false, busy)}>Disconnect</button>
      )}
    </div>
  );
}

// ─── On a load ────────────────────────────────────────────────────────────────

interface SendStatus { hasDriver: boolean; connected: boolean; groupTitle: string; sentAt: string }

// The button that posts a trip to its driver's group. Two looks, one behaviour: a labelled
// button beside "Edit load" on the load's page, and an icon among a row's actions in the
// list. Either opens a small confirmation first — a message in a group can't be taken back,
// and a stray click on a row should not put a trip in front of a driver. The confirmation
// says which group it goes to and when it last went.
//
// What goes is the load as it is stored at that moment, so sending again after an edit
// sends the edit.
export function SendToDriverButton({ loadId, loadLabel, driverName, variant }: { loadId: string; loadLabel: string; driverName: string; variant: "button" | "icon" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasPerm(user, "loads", "update")) return null;
  const label = `Send ${loadLabel || "load"} to the driver's Telegram group`;
  return (
    <>
      {variant === "button" ? (
        <button onClick={() => setOpen(true)} title={label}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; }}>
          <Send size={13} /> Send to driver
        </button>
      ) : (
        <button onClick={() => setOpen(true)} aria-label={label} title={label}
          style={{ width: 30, height: 30, borderRadius: 7, border: "none", backgroundColor: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.backgroundColor = "var(--primary-soft)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
          <Send size={14} />
        </button>
      )}
      {open && <SendDialog loadId={loadId} loadLabel={loadLabel} driverName={driverName} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendDialog({ loadId, loadLabel, driverName, onClose }: { loadId: string; loadLabel: string; driverName: string; onClose: () => void }) {
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    api.get<Raw>(`/loads/${loadId}/telegram`)
      .then((s) => { if (!gone) setStatus({ hasDriver: !!s?.has_driver, connected: !!s?.connected, groupTitle: s?.group_title ?? "", sentAt: s?.sent_at ?? "" }); })
      .catch((e) => { if (!gone) setProblem(friendlyError(e, "Couldn't check where this goes. Try again.")); });
    return () => { gone = true; };
  }, [loadId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const send = async () => {
    setBusy(true); setProblem("");
    try {
      await api.post(`/loads/${loadId}/telegram`);
      notify.success(status?.sentAt ? "Sent again" : "Sent to the driver's group");
      onClose();
    } catch (e) {
      // Kept open with the server's own sentence: a group the bot was removed from, or
      // Telegram not answering, is something to read, not a toast that flashes past.
      setProblem(friendlyError(e, "Couldn't send it. Try again."));
      setBusy(false);
    }
  };

  const who = driverName || "the driver";
  const canSend = !!status?.hasDriver && status.connected;
  return createPortal(
    <>
      <div onClick={() => { if (!busy) onClose(); }} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 400 }} />
      <div role="dialog" aria-modal="true" aria-label="Send to driver"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 420, maxWidth: "calc(100vw - 32px)", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", padding: 20, display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Send size={16} style={{ color: "var(--primary)" }} />
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Send {loadLabel || "this load"} to the driver</div>
        </div>

        <div style={{ ...note, fontSize: 13 }}>
          {problem ? null
            : !status ? "Checking where this goes…"
            : !status.hasDriver ? "This load has no driver yet. Assign one, then send it."
            : !status.connected ? `${who} has no Telegram group connected. Add the Brelo bot to the group you share with them and type /assign ${who} there, then send this.`
            : <>
                It will be posted to <b style={{ color: "var(--foreground)" }}>{status.groupTitle || `${who}'s Telegram group`}</b> as the load is saved right now.
                {status.sentAt && <> Last sent {fmtDateTime(status.sentAt)}; this one will be marked as an update.</>}
              </>}
        </div>
        {problem && <div role="alert" style={{ ...note, fontSize: 13, color: "#DC2626" }}>{problem}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={btn(false, busy)}>{canSend ? "Cancel" : "Close"}</button>
          {canSend && <button onClick={send} disabled={busy} style={btn(true, busy)}>{busy ? "Sending…" : status.sentAt ? "Send again" : "Send"}</button>}
        </div>
      </div>
    </>,
    document.body,
  );
}

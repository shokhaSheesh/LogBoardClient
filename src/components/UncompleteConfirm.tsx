import { createPortal } from "react-dom";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { STATUS_CONFIG, type Status } from "../lib/statuses";

// Moving a load out of `completed` is the one destructive action on the board that
// happens from a plain dropdown: the backend deletes the load's payout row and clears
// its completed_at (the payout's twin — set and cleared together), and the stored gross
// for that day is rewritten. It's recoverable — the dispatcher's added/deducted/notes
// are archived and restored if the load is completed again — but a single click
// shouldn't quietly tear a row out of the money ledger with no way to notice.
//
// Used everywhere a status can be changed: Loads, Board, and both Drivers tables.
export function UncompleteConfirm({ to, label, busy, onCancel, onConfirm }: {
  to: Status;                // the status being moved to
  label?: string;            // the load ref or driver name, when we have one
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const toLabel = STATUS_CONFIG[to]?.label ?? to;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 9600, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RotateCcw size={15} style={{ color: "#F59E0B" }} />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
            Un-complete this load?
          </span>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.55 }}>
            {label ? <><strong style={{ color: "var(--foreground)" }}>{label}</strong> goes</> : "This load goes"} back to{" "}
            <strong style={{ color: "var(--foreground)" }}>{toLabel}</strong>.
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8 }}>
            <AlertTriangle size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#F59E0B", lineHeight: 1.5 }}>
              Its <strong>payout is removed</strong> and this week's gross drops by that amount.
              Any added/deducted/notes are kept, and come back if the load is completed again.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: busy ? "default" : "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: busy ? "var(--muted)" : "#F59E0B", color: busy ? "var(--muted-foreground)" : "#fff", cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "Working…" : "Un-complete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

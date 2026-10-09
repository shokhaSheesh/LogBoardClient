import type { ReactNode } from "react";

// One summary figure: a label, the number, an optional note beside it, and an icon on
// the right that says at a glance what the number is. Shared by Gross and Payouts so the
// strips read as the same thing. `tone` colours the number when its sign matters.
export function Kpi({ label, value, note, noteTone = "plain", icon, tone = "plain" }: {
  label: string;
  value: ReactNode;
  note?: string;
  // Colours the note when it is a change that reads as good or bad (e.g. "+12% vs last week").
  noteTone?: "plain" | "good" | "bad";
  icon?: ReactNode;
  tone?: "plain" | "good" | "bad";
}) {
  const color = tone === "good" ? "var(--primary)" : tone === "bad" ? "#EF4444" : "var(--foreground)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px 9px 14px", minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
          {note && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: noteTone === "plain" ? 400 : 600, color: noteTone === "good" ? "var(--primary)" : noteTone === "bad" ? "#EF4444" : "var(--muted-foreground)" }}>{note}</span>}
        </div>
      </div>
      {icon && (
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}>
          {icon}
        </span>
      )}
    </div>
  );
}

import type { CSSProperties } from "react";

// One look for every calendar and period list in the app — the load form's date picker,
// the range picker on Gross / Dashboard / Loads / Payouts, and the week / month / year
// lists. They are separate components, so the sizes, fonts and colours live here and each
// of them reads these instead of carrying its own.
export const CAL = {
  width: 272,

  // The floating panel.
  panel: {
    boxSizing: "border-box", padding: 12, backgroundColor: "var(--card)",
    border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
  } as CSSProperties,

  // ‹ title ›
  header: { display: "flex", alignItems: "center", gap: 4, marginBottom: 8 } as CSSProperties,
  nav: {
    width: 28, height: 28, border: "none", borderRadius: 6, backgroundColor: "transparent", cursor: "pointer",
    fontFamily: "var(--font-sans)", fontSize: 18, color: "var(--foreground)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  } as CSSProperties,
  title: {
    flex: 1, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
    color: "var(--foreground)", background: "none", border: "none", padding: "4px 6px", borderRadius: 6,
  } as CSSProperties,

  // Su Mo Tu …
  weekday: {
    textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", padding: "2px 0 4px",
  } as CSSProperties,

  // A month, a year, or a week row: clear until it's the chosen one.
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 } as CSSProperties,
  option: (active: boolean, disabled = false): CSSProperties => ({
    padding: "8px 4px", borderRadius: 6, border: "none", fontFamily: "var(--font-sans)", fontSize: 12.5,
    fontWeight: active ? 600 : 400, fontVariantNumeric: "tabular-nums",
    backgroundColor: active ? "var(--primary)" : "transparent",
    color: active ? "#fff" : "var(--foreground)",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
  }),

  // A day number.
  dayText: { fontFamily: "var(--font-sans)", fontSize: 12 } as CSSProperties,

  hint: { fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.4 } as CSSProperties,
};

// Hover for a CAL.option that isn't the chosen one.
export const calHover = (active: boolean, disabled = false) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (!active && !disabled) e.currentTarget.style.backgroundColor = "var(--muted)"; },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; },
});

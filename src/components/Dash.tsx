// The one "nothing here" mark. Every empty cell renders this instead of typing its own
// "—", so the dash is the same glyph, size, weight and colour wherever it appears —
// whatever font the cell around it uses (mono numbers, bold totals, struck-through stops).
// inline-block keeps a parent's line-through or underline from running across it.
export function Dash() {
  return (
    <span aria-label="None" style={{
      display: "inline-block", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 400,
      fontStyle: "normal", letterSpacing: 0, color: "var(--muted-foreground)", textDecoration: "none", userSelect: "none",
    }}>—</span>
  );
}

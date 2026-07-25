// The one page/section loading state: a centered spinner above a "Loading <what>…"
// label. Every screen uses this for its initial fetch so loading looks identical
// everywhere, instead of each page inventing its own placement (top vs centre) and
// wording. `label` names what's loading, e.g. <PageLoader label="drivers" />.
export function PageLoader({ label }: { label: string }) {
  return (
    <div style={{
      // flex:1 centres inside a flex-column parent; height:100% centres inside a plain
      // block parent that still has a definite height (e.g. the layout's <main>, a flex
      // item); minHeight is the floor for auto-height contexts like a table cell.
      flex: 1, height: "100%", minHeight: 240, width: "100%",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        border: "2.5px solid var(--border)", borderTopColor: "var(--primary)",
        animation: "spin 0.7s linear infinite", display: "inline-block",
      }} />
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
        Loading {label}…
      </span>
    </div>
  );
}

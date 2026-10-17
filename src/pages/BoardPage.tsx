import { DispatchTable } from "../components/DispatchTable";

export function BoardPage() {
  return (
    // The height comes from <main> (100%): it is a plain scrolling block, not a flex box, so
    // flex: 1 here sized nothing and the board grew to its full height, pushing its left–right
    // bar to the bottom of the page.
    <div style={{ height: "100%", boxSizing: "border-box", overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}>
        <DispatchTable />
      </div>
    </div>
  );
}

import { DispatchTable } from "../components/DispatchTable";

export function BoardPage() {
  return (
    <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}>
        <DispatchTable />
      </div>
    </div>
  );
}

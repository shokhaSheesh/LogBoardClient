import { LayoutDashboard } from "lucide-react";

export function DashboardPage() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-96 gap-4">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 56,
          height: 56,
          backgroundColor: "var(--secondary)",
        }}
      >
        <LayoutDashboard size={24} style={{ color: "var(--primary)" }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
        Dashboard
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
        KPI overview coming soon
      </div>
    </div>
  );
}

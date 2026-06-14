import { DollarSign } from "lucide-react";

export function PayoutsPage() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-96 gap-4">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 56,
          height: 56,
          backgroundColor: "#ECFDF5",
        }}
      >
        <DollarSign size={24} style={{ color: "#059669" }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
        Payouts
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
        Driver payout management coming soon
      </div>
    </div>
  );
}

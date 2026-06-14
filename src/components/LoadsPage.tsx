import { useState } from "react";
import { Package, Plus, Pencil, Trash2, X, Check, MapPin, Clock, DollarSign, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LoadStatus = "Pending" | "Assigned" | "In Transit" | "Delivered" | "Cancelled" | "TONU";

interface Load {
  id: number;
  loadId: string;
  broker: string;
  driver: string;
  status: LoadStatus;
  pickupAppt: string;
  dropAppt: string;
  origin: string;
  destination: string;
  payout: number;
  dispatcher: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<LoadStatus, { color: string; bg: string; dot: string }> = {
  Pending:    { color: "#92400E", bg: "#FEF3C7", dot: "#F59E0B" },
  Assigned:   { color: "#1D4ED8", bg: "#DBEAFE", dot: "#3B82F6" },
  "In Transit":{ color: "#5B21B6", bg: "#EDE9FE", dot: "#8B5CF6" },
  Delivered:  { color: "#065F46", bg: "#D1FAE5", dot: "#10B981" },
  Cancelled:  { color: "#991B1B", bg: "#FEE2E2", dot: "#EF4444" },
  TONU:       { color: "#374151", bg: "#F3F4F6", dot: "#9CA3AF" },
};

const ALL_STATUSES: LoadStatus[] = ["Pending", "Assigned", "In Transit", "Delivered", "Cancelled", "TONU"];

// ─── Seed data ────────────────────────────────────────────────────────────────

const initLoads: Load[] = [
  { id: 1,  loadId: "LD-00481", broker: "Echo Global",       driver: "Carlos Mendez",        status: "In Transit",  pickupAppt: "06/12 · 08:00", dropAppt: "06/12 · 17:30", origin: "Dallas, TX",       destination: "Memphis, TN",      payout: 1850, dispatcher: "Jake R."   },
  { id: 2,  loadId: "LD-00290", broker: "Coyote Logistics",  driver: "Angela Torres",         status: "Delivered",   pickupAppt: "06/11 · 07:00", dropAppt: "06/11 · 16:00", origin: "Chicago, IL",      destination: "Indianapolis, IN", payout: 1200, dispatcher: "Sofia R."  },
  { id: 3,  loadId: "LD-00813", broker: "XPO Logistics",     driver: "Darnell Washington",    status: "Assigned",    pickupAppt: "06/12 · 11:00", dropAppt: "06/12 · 16:00", origin: "Atlanta, GA",      destination: "Nashville, TN",    payout: 950,  dispatcher: "Marcus T." },
  { id: 4,  loadId: "LD-00577", broker: "Total Quality",     driver: "Priya Sharma",          status: "In Transit",  pickupAppt: "06/12 · 14:30", dropAppt: "06/13 · 07:00", origin: "Houston, TX",      destination: "San Antonio, TX",  payout: 750,  dispatcher: "Jake R."   },
  { id: 5,  loadId: "LD-00342", broker: "Mode Transport",    driver: "Marcus Webb",           status: "Delivered",   pickupAppt: "06/11 · 09:00", dropAppt: "06/12 · 10:45", origin: "Phoenix, AZ",      destination: "Los Angeles, CA",  payout: 2100, dispatcher: "Sofia R."  },
  { id: 6,  loadId: "LD-00610", broker: "Arrive Logistics",  driver: "Linda Okafor",          status: "In Transit",  pickupAppt: "06/12 · 06:30", dropAppt: "06/12 · 19:00", origin: "Denver, CO",       destination: "Kansas City, MO",  payout: 1400, dispatcher: "Marcus T." },
  { id: 7,  loadId: "LD-00924", broker: "GlobalTranz",       driver: "Ray Kowalski",          status: "Pending",     pickupAppt: "06/13 · 08:00", dropAppt: "06/13 · 15:30", origin: "Las Vegas, NV",    destination: "Salt Lake City, UT",payout: 880, dispatcher: "Jake R."   },
  { id: 8,  loadId: "LD-00157", broker: "Transplace",        driver: "—",                     status: "Pending",     pickupAppt: "06/14 · 09:00", dropAppt: "06/14 · 18:00", origin: "Miami, FL",        destination: "Orlando, FL",      payout: 620,  dispatcher: "Sofia R."  },
  { id: 9,  loadId: "LD-01024", broker: "RXO",               driver: "Jean Eddy Simon",       status: "Assigned",    pickupAppt: "06/13 · 06:00", dropAppt: "06/14 · 08:00", origin: "Nashville, TN",    destination: "Charlotte, NC",    payout: 1650, dispatcher: "Marcus T." },
  { id: 10, loadId: "LD-01105", broker: "Uber Freight",      driver: "Keavis Dyer",           status: "In Transit",  pickupAppt: "06/12 · 10:00", dropAppt: "06/13 · 14:00", origin: "Columbus, OH",     destination: "Pittsburgh, PA",   payout: 980,  dispatcher: "Jake R."   },
  { id: 11, loadId: "LD-01233", broker: "CH Robinson",       driver: "Shokhnurbek Komilov",   status: "Delivered",   pickupAppt: "06/10 · 07:30", dropAppt: "06/11 · 12:00", origin: "Seattle, WA",      destination: "Portland, OR",     payout: 540,  dispatcher: "Sofia R."  },
  { id: 12, loadId: "LD-01344", broker: "Schneider",         driver: "Bakhodir Azamov",       status: "Delivered",   pickupAppt: "06/11 · 08:00", dropAppt: "06/12 · 09:00", origin: "Minneapolis, MN",  destination: "Chicago, IL",      payout: 1100, dispatcher: "Marcus T." },
  { id: 13, loadId: "LD-01412", broker: "Landstar",          driver: "Tomás García",          status: "Cancelled",   pickupAppt: "06/12 · 08:00", dropAppt: "06/12 · 14:00", origin: "Detroit, MI",      destination: "Cleveland, OH",    payout: 0,    dispatcher: "Jake R."   },
  { id: 14, loadId: "LD-01551", broker: "Echo Global",       driver: "Carlos Mendez",         status: "TONU",        pickupAppt: "06/09 · 10:00", dropAppt: "06/09 · 16:00", origin: "St. Louis, MO",    destination: "Kansas City, MO",  payout: 150,  dispatcher: "Sofia R."  },
  { id: 15, loadId: "LD-01680", broker: "Coyote Logistics",  driver: "—",                     status: "Pending",     pickupAppt: "06/15 · 07:00", dropAppt: "06/16 · 11:00", origin: "San Diego, CA",    destination: "Las Vegas, NV",    payout: 1750, dispatcher: "Marcus T." },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LoadStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
      color: c.color, backgroundColor: c.bg,
      borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: c.dot, flexShrink: 0, display: "inline-block" }} />
      {status}
    </span>
  );
}

function fmt(n: number) {
  return n === 0 ? "—" : `$${n.toLocaleString()}`;
}

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: string }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
  }}>
    {children}
  </th>
);

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 6, border: "none",
      backgroundColor: bg, color, cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >
      {icon}
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LoadModal({ load, onClose, onSave }: {
  load: Partial<Load>;
  onClose: () => void;
  onSave: (l: Load) => void;
}) {
  const [form, setForm] = useState<Partial<Load>>(load);
  const set = <K extends keyof Load>(k: K, v: Load[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !load.id;

  const inputStyle = {
    fontFamily: "var(--font-sans)", fontSize: 13,
    padding: "7px 10px", borderRadius: 6,
    border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
    color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" as const,
  };
  const labelStyle = { display: "flex" as const, flexDirection: "column" as const, gap: 5 };
  const capStyle = { fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} style={{ color: "var(--primary)" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              {isNew ? "Create Load" : `Edit ${load.loadId}`}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, overflowY: "auto" }}>
          <label style={labelStyle}>
            <span style={capStyle}>Load ID</span>
            <input value={form.loadId ?? ""} onChange={(e) => set("loadId", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="LD-00000" />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Broker</span>
            <input value={form.broker ?? ""} onChange={(e) => set("broker", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Driver</span>
            <input value={form.driver ?? ""} onChange={(e) => set("driver", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Dispatcher</span>
            <input value={form.dispatcher ?? ""} onChange={(e) => set("dispatcher", e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Status</span>
            <select value={form.status ?? "Pending"} onChange={(e) => set("status", e.target.value as LoadStatus)} style={{ ...inputStyle }}>
              {ALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Payout ($)</span>
            <input type="number" value={form.payout ?? ""} onChange={(e) => set("payout", Number(e.target.value))} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="0" />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Pickup Appt</span>
            <input value={form.pickupAppt ?? ""} onChange={(e) => set("pickupAppt", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="06/12 · 08:00" />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Drop Appt</span>
            <input value={form.dropAppt ?? ""} onChange={(e) => set("dropAppt", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="06/12 · 17:00" />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Origin</span>
            <input value={form.origin ?? ""} onChange={(e) => set("origin", e.target.value)} style={inputStyle} placeholder="City, ST" />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Destination</span>
            <input value={form.destination ?? ""} onChange={(e) => set("destination", e.target.value)} style={inputStyle} placeholder="City, ST" />
          </label>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(form as Load)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {isNew ? "Create Load" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Delete load?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
          Load <strong>{label}</strong> will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoadsPage() {
  const [loads, setLoads] = useState<Load[]>(initLoads);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<Load>>({});
  const [deleting, setDeleting] = useState<Load | null>(null);
  const [filterStatus, setFilterStatus] = useState<LoadStatus | "All">("All");
  const [showFilter, setShowFilter] = useState(false);

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (l: Load) => { setEditing(l); setModal("edit"); };
  const save = (l: Load) => {
    if (modal === "create") {
      const nextId = Math.max(0, ...loads.map((x) => x.id)) + 1;
      setLoads((prev) => [...prev, { ...l, id: nextId }]);
    } else {
      setLoads((prev) => prev.map((x) => (x.id === l.id ? l : x)));
    }
    setModal(null);
  };
  const del = () => { if (deleting) setLoads((prev) => prev.filter((x) => x.id !== deleting.id)); setDeleting(null); };

  const filtered = filterStatus === "All" ? loads : loads.filter((l) => l.status === filterStatus);
  const totalPayout = filtered.reduce((s, l) => s + l.payout, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0, gap: 12 }}>
        {/* Left: counts + filter pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{filtered.length}</span>{" "}
            {filterStatus === "All" ? "loads total" : filterStatus.toLowerCase()}
          </span>
          {/* Status filter pills */}
          <button
            onClick={() => setFilterStatus("All")}
            style={{
              fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: filterStatus === "All" ? 700 : 400,
              color: filterStatus === "All" ? "var(--primary)" : "var(--muted-foreground)",
              backgroundColor: filterStatus === "All" ? "var(--secondary)" : "var(--muted)",
              border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
            }}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => {
            const cnt = loads.filter((l) => l.status === s).length;
            const active = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? STATUS_CFG[s].color : "var(--muted-foreground)",
                  backgroundColor: active ? STATUS_CFG[s].bg : "var(--muted)",
                  border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: STATUS_CFG[s].dot, display: "inline-block" }} />
                {s} · {cnt}
              </button>
            );
          })}
        </div>

        {/* Right: total payout + create */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Payout</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "#10B981" }}>${totalPayout.toLocaleString()}</div>
          </div>
          <button
            onClick={openCreate}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", flexShrink: 0 }}
          >
            <Plus size={14} /> Create Load
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={110}>Load ID</TH>
              <TH width={170}>Broker</TH>
              <TH width={190}>Driver</TH>
              <TH width={120}>Status</TH>
              <TH width={190}>Appt Times</TH>
              <TH width={170}>Origin</TH>
              <TH width={180}>Destination</TH>
              <TH width={100} align="right">Payout</TH>
              <TH width={120}>Dispatcher</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, i) => (
              <tr
                key={l.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                {/* # */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", verticalAlign: "middle" }}>
                  {l.id}
                </td>

                {/* Load ID */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>
                    {l.loadId}
                  </span>
                </td>

                {/* Broker */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", verticalAlign: "middle" }}>
                  {l.broker}
                </td>

                {/* Driver */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: l.driver === "—" ? "var(--muted-foreground)" : "var(--foreground)", fontStyle: l.driver === "—" ? "italic" : "normal" }}>
                    {l.driver === "—" ? "Unassigned" : l.driver}
                  </span>
                </td>

                {/* Status */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <StatusBadge status={l.status} />
                </td>

                {/* Appt Times */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>PU</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground)" }}>{l.pickupAppt}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>DR</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--foreground)" }}>{l.dropAppt}</span>
                    </div>
                  </div>
                </td>

                {/* Origin */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={11} style={{ color: "#10B981", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", whiteSpace: "nowrap" }}>{l.origin}</span>
                  </div>
                </td>

                {/* Destination */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={11} style={{ color: "#EF4444", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", whiteSpace: "nowrap" }}>{l.destination}</span>
                  </div>
                </td>

                {/* Payout */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle", textAlign: "right" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                    color: l.payout === 0 ? "var(--muted-foreground)" : l.status === "Cancelled" ? "#EF4444" : "#10B981",
                  }}>
                    {fmt(l.payout)}
                  </span>
                </td>

                {/* Dispatcher */}
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{l.dispatcher}</span>
                </td>

                {/* Actions */}
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(l)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(l)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {(modal === "create" || modal === "edit") && (
        <LoadModal load={editing} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.loadId} onClose={() => setDeleting(null)} onConfirm={del} />
      )}
    </div>
  );
}

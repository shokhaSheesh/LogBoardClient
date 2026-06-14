import { useState } from "react";
import { Truck, Container, Plus, Pencil, Trash2, X, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TruckRow {
  id: number;
  unit: string;
  driver: string;
  make: string;
  model: string;
  vin: string;
}

interface TrailerRow {
  id: number;
  unit: string;
  driver: string;
  make: string;
  model: string;
  vin: string;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const initTrucks: TruckRow[] = [
  { id: 1,  unit: "TRK-4481", driver: "Carlos Mendez",        make: "Kenworth",    model: "T680",      vin: "1XKWD49X5EJ401223" },
  { id: 2,  unit: "TRK-2290", driver: "Angela Torres",        make: "Peterbilt",   model: "579",       vin: "1XPBD49X3KD621045" },
  { id: 3,  unit: "TRK-8813", driver: "Darnell Washington",   make: "Freightliner",model: "Cascadia",  vin: "3AKJGLDR4LSLR7721" },
  { id: 4,  unit: "TRK-5577", driver: "Priya Sharma",         make: "Volvo",       model: "VNL 860",   vin: "4V4NC9EH4KN222014" },
  { id: 5,  unit: "TRK-3342", driver: "Marcus Webb",          make: "International",model: "LT",       vin: "3HSCUAPR8CN621870" },
  { id: 6,  unit: "TRK-6610", driver: "Linda Okafor",         make: "Kenworth",    model: "W900",      vin: "1XKWDB9X9MJ501334" },
  { id: 7,  unit: "TRK-9924", driver: "Ray Kowalski",         make: "Peterbilt",   model: "389",       vin: "1XPFDU9X0ND731256" },
  { id: 8,  unit: "TRK-1157", driver: "Tomás García",         make: "Mack",        model: "Anthem",    vin: "1M1AN07Y3KM031788" },
  { id: 9,  unit: "TRK-7701", driver: "Jean Eddy Simon",      make: "Freightliner",model: "Cascadia",  vin: "3AKJHHDR2LSLR8844" },
  { id: 10, unit: "TRK-4412", driver: "Keavis Dyer",          make: "Kenworth",    model: "T680",      vin: "1XKWD49X3NJ512009" },
  { id: 11, unit: "TRK-6650", driver: "Shokhnurbek Komilov",  make: "Volvo",       model: "VNL 760",   vin: "4V4NC9TH2KN204412" },
  { id: 12, unit: "TRK-1130", driver: "Bakhodir Azamov",      make: "Peterbilt",   model: "579",       vin: "1XPBD49X8LD614330" },
];

const initTrailers: TrailerRow[] = [
  { id: 1,  unit: "TRL-2210", driver: "Carlos Mendez",        make: "Wabash",      model: "DuraPlate 53'", vin: "1JJV532W1KL990012" },
  { id: 2,  unit: "TRL-0881", driver: "Angela Torres",        make: "Great Dane",  model: "Champion",      vin: "1GRAP0623KA703341" },
  { id: 3,  unit: "TRL-4430", driver: "Darnell Washington",   make: "Utility",     model: "3000R 53'",     vin: "1UYVS25386U812203" },
  { id: 4,  unit: "TRL-1190", driver: "Priya Sharma",         make: "Stoughton",   model: "EFB 53'",       vin: "1DW1A5326HB677004" },
  { id: 5,  unit: "TRL-6620", driver: "Marcus Webb",          make: "Wabash",      model: "National 53'",  vin: "1JJV532W3LL910045" },
  { id: 6,  unit: "TRL-3300", driver: "Linda Okafor",         make: "Great Dane",  model: "Everest",       vin: "1GRAP0627LA803502" },
  { id: 7,  unit: "TRL-7710", driver: "Ray Kowalski",         make: "Utility",     model: "3000R 48'",     vin: "1UYVS25312U908814" },
  { id: 8,  unit: "TRL-5540", driver: "Tomás García",         make: "Vanguard",    model: "VAN 53'",       vin: "5V8VA5328LM211009" },
  { id: 9,  unit: "TRL-8810", driver: "Jean Eddy Simon",      make: "Wabash",      model: "DuraPlate 53'", vin: "1JJV532W9KL990447" },
  { id: 10, unit: "TRL-2230", driver: "Keavis Dyer",          make: "Stoughton",   model: "EFB 48'",       vin: "1DW1A5324JB677891" },
  { id: 11, unit: "TRL-9910", driver: "Shokhnurbek Komilov",  make: "Great Dane",  model: "Champion",      vin: "1GRAP0621MA803019" },
  { id: 12, unit: "TRL-4450", driver: "Bakhodir Azamov",      make: "Utility",     model: "3000R 53'",     vin: "1UYVS25344U812667" },
];

// ─── Shared primitives ────────────────────────────────────────────────────────

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

const TD = ({ children, mono = false, center = false }: { children: React.ReactNode; mono?: boolean; center?: boolean }) => (
  <td style={{
    padding: "10px 14px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: mono ? 11 : 12, color: "var(--foreground)",
    borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
    verticalAlign: "middle", textAlign: center ? "center" : "left",
  }}>
    {children}
  </td>
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

type EquipRow = TruckRow | TrailerRow;

function EquipModal({ title, row, onClose, onSave }: {
  title: string;
  row: Partial<EquipRow>;
  onClose: () => void;
  onSave: (r: EquipRow) => void;
}) {
  const [form, setForm] = useState<Partial<EquipRow>>(row);
  const set = (k: keyof EquipRow, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !row.id;

  const fields: [keyof EquipRow, string, boolean][] = [
    ["unit",   "Unit #",  true],
    ["driver", "Driver",  false],
    ["make",   "Make",    false],
    ["model",  "Model",   false],
    ["vin",    "VIN",     true],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {fields.map(([k, label, mono]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: k === "vin" ? "1 / -1" : undefined }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              <input
                value={(form[k] as string) ?? ""}
                onChange={(e) => set(k, e.target.value)}
                style={{
                  fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
                  fontSize: 13, padding: "7px 10px", borderRadius: 6,
                  border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
                  color: "var(--foreground)", outline: "none", letterSpacing: mono ? "0.04em" : undefined,
                }}
              />
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(form as EquipRow)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {isNew ? "Create" : "Save Changes"}
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
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Remove equipment?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
          <strong>{label}</strong> will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Trucks tab ───────────────────────────────────────────────────────────────

function TrucksTab() {
  const [rows, setRows] = useState<TruckRow[]>(initTrucks);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<TruckRow>>({});
  const [deleting, setDeleting] = useState<TruckRow | null>(null);

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (r: TruckRow) => { setEditing(r); setModal("edit"); };
  const save = (r: EquipRow) => {
    const d = r as TruckRow;
    if (modal === "create") {
      const nextId = Math.max(0, ...rows.map((x) => x.id)) + 1;
      setRows((prev) => [...prev, { ...d, id: nextId }]);
    } else {
      setRows((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    }
    setModal(null);
  };
  const del = () => { if (deleting) setRows((prev) => prev.filter((x) => x.id !== deleting.id)); setDeleting(null); };

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{rows.length}</span> trucks in fleet
        </span>
        <button onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
          <Plus size={14} /> Add Truck
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={120}>Unit #</TH>
              <TH width={200}>Driver</TH>
              <TH width={150}>Make</TH>
              <TH width={160}>Model</TH>
              <TH width={220}>VIN</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{r.id}</TD>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>
                    {r.unit}
                  </span>
                </td>
                <TD>{r.driver || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>}</TD>
                <TD>{r.make}</TD>
                <TD>{r.model}</TD>
                <TD mono>{r.vin}</TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(r)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(r)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === "create" || modal === "edit") && (
        <EquipModal title={modal === "create" ? "Add Truck" : "Edit Truck"} row={editing} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && <DeleteConfirm label={deleting.unit} onClose={() => setDeleting(null)} onConfirm={del} />}
    </>
  );
}

// ─── Trailers tab ─────────────────────────────────────────────────────────────

function TrailersTab() {
  const [rows, setRows] = useState<TrailerRow[]>(initTrailers);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<TrailerRow>>({});
  const [deleting, setDeleting] = useState<TrailerRow | null>(null);

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (r: TrailerRow) => { setEditing(r); setModal("edit"); };
  const save = (r: EquipRow) => {
    const d = r as TrailerRow;
    if (modal === "create") {
      const nextId = Math.max(0, ...rows.map((x) => x.id)) + 1;
      setRows((prev) => [...prev, { ...d, id: nextId }]);
    } else {
      setRows((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    }
    setModal(null);
  };
  const del = () => { if (deleting) setRows((prev) => prev.filter((x) => x.id !== deleting.id)); setDeleting(null); };

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{rows.length}</span> trailers in fleet
        </span>
        <button onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
          <Plus size={14} /> Add Trailer
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={130}>Unit #</TH>
              <TH width={200}>Driver</TH>
              <TH width={150}>Make</TH>
              <TH width={200}>Model</TH>
              <TH width={220}>VIN</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{r.id}</TD>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#5B21B6", backgroundColor: "#EDE9FE", borderRadius: 4, padding: "2px 8px" }}>
                    {r.unit}
                  </span>
                </td>
                <TD>{r.driver || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>}</TD>
                <TD>{r.make}</TD>
                <TD>{r.model}</TD>
                <TD mono>{r.vin}</TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(r)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(r)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === "create" || modal === "edit") && (
        <EquipModal title={modal === "create" ? "Add Trailer" : "Edit Trailer"} row={editing} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && <DeleteConfirm label={deleting.unit} onClose={() => setDeleting(null)} onConfirm={del} />}
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

type TabId = "trucks" | "trailers";

export function EquipmentsPage() {
  const [tab, setTab] = useState<TabId>("trucks");

  const tabs: { id: TabId; label: string; count: number; icon: React.ReactNode; color: string; bg: string }[] = [
    { id: "trucks",   label: "Trucks",   count: initTrucks.length,   icon: <Truck     size={15} />, color: "#1D4ED8", bg: "#DBEAFE" },
    { id: "trailers", label: "Trailers", count: initTrailers.length, icon: <Container size={15} />, color: "#5B21B6", bg: "#EDE9FE" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      {/* Tab bar */}
      <div style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 20px", flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 18px",
                fontFamily: "var(--font-sans)", fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? t.color : "var(--muted-foreground)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${t.color}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                marginBottom: -1,
              }}
            >
              <span style={{ opacity: active ? 1 : 0.55 }}>{t.icon}</span>
              {t.label}
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: active ? t.color : "var(--muted-foreground)",
                backgroundColor: active ? t.bg : "var(--muted)",
                borderRadius: 10, padding: "1px 7px",
              }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "trucks"   && <TrucksTab />}
        {tab === "trailers" && <TrailersTab />}
      </div>
    </div>
  );
}

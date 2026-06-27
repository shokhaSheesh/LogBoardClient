import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus, X, Search, ChevronDown, DollarSign,
  ChevronLeft, ChevronRight, Pencil, Trash2, Check,
  CalendarDays, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payout {
  id: number;
  dispatcher: string;
  driverName: string;
  loadId: string;
  brokerName: string;
  origin: string;
  destination: string;
  rate: number;
  added: number;
  deducted: number;
  notes: string;
  date: string;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const INIT_PAYOUTS: Payout[] = [
  { id: 1,  dispatcher: "Jake Reynolds",   driverName: "Carlos Mendez",       loadId: "LD-00481", brokerName: "Echo Global",      origin: "Dallas, TX",      destination: "Memphis, TN",        rate: 1850, added: 150,  deducted: 0,   notes: "Lumper fee reimbursed",          date: "06/12/2026" },
  { id: 2,  dispatcher: "Sofia Reyes",     driverName: "Angela Torres",       loadId: "LD-00290", brokerName: "Coyote Logistics", origin: "Chicago, IL",     destination: "Indianapolis, IN",   rate: 1200, added: 0,    deducted: 75,  notes: "Short on weight — minor deduct", date: "06/11/2026" },
  { id: 3,  dispatcher: "Marcus Thompson", driverName: "Darnell Washington",  loadId: "LD-00813", brokerName: "XPO Logistics",    origin: "Atlanta, GA",     destination: "Nashville, TN",      rate: 950,  added: 0,    deducted: 0,   notes: "",                               date: "06/12/2026" },
  { id: 4,  dispatcher: "Jake Reynolds",   driverName: "Priya Sharma",        loadId: "LD-00577", brokerName: "Total Quality",    origin: "Houston, TX",     destination: "San Antonio, TX",    rate: 750,  added: 200,  deducted: 0,   notes: "Detention bonus approved",       date: "06/13/2026" },
  { id: 5,  dispatcher: "Sofia Reyes",     driverName: "Marcus Webb",         loadId: "LD-00342", brokerName: "Mode Transport",   origin: "Phoenix, AZ",     destination: "Los Angeles, CA",    rate: 2100, added: 0,    deducted: 100, notes: "Late delivery penalty",          date: "06/12/2026" },
  { id: 6,  dispatcher: "Marcus Thompson", driverName: "Linda Okafor",        loadId: "LD-00610", brokerName: "Arrive Logistics", origin: "Denver, CO",      destination: "Kansas City, MO",    rate: 1400, added: 0,    deducted: 0,   notes: "",                               date: "06/12/2026" },
  { id: 7,  dispatcher: "Jake Reynolds",   driverName: "Ray Kowalski",        loadId: "LD-00924", brokerName: "GlobalTranz",      origin: "Las Vegas, NV",   destination: "Salt Lake City, UT", rate: 880,  added: 50,   deducted: 0,   notes: "Extra stop bonus",               date: "06/13/2026" },
  { id: 8,  dispatcher: "Sofia Reyes",     driverName: "Jean Eddy Simon",     loadId: "LD-01024", brokerName: "RXO",              origin: "Nashville, TN",   destination: "Charlotte, NC",      rate: 1650, added: 0,    deducted: 0,   notes: "",                               date: "06/14/2026" },
  { id: 9,  dispatcher: "Marcus Thompson", driverName: "Keavis Dyer",         loadId: "LD-01105", brokerName: "Uber Freight",     origin: "Columbus, OH",    destination: "Pittsburgh, PA",     rate: 980,  added: 0,    deducted: 50,  notes: "Fuel surcharge adjusted",        date: "06/13/2026" },
  { id: 10, dispatcher: "Sofia Reyes",     driverName: "Shokhnurbek Komilov", loadId: "LD-01233", brokerName: "CH Robinson",      origin: "Seattle, WA",     destination: "Portland, OR",       rate: 540,  added: 100,  deducted: 0,   notes: "Hazmat bonus",                   date: "06/11/2026" },
  { id: 11, dispatcher: "Marcus Thompson", driverName: "Bakhodir Azamov",     loadId: "LD-01344", brokerName: "Schneider",        origin: "Minneapolis, MN", destination: "Chicago, IL",        rate: 1100, added: 0,    deducted: 0,   notes: "",                               date: "06/12/2026" },
  { id: 12, dispatcher: "Jake Reynolds",   driverName: "Tomás García",        loadId: "LD-01412", brokerName: "Landstar",         origin: "Detroit, MI",     destination: "Cleveland, OH",      rate: 720,  added: 0,    deducted: 200, notes: "Broker deducted for POD delay",  date: "06/12/2026" },
  { id: 13, dispatcher: "Sofia Reyes",     driverName: "Carlos Mendez",       loadId: "LD-01551", brokerName: "Echo Global",      origin: "St. Louis, MO",   destination: "Kansas City, MO",    rate: 640,  added: 75,   deducted: 0,   notes: "Weekend rate bonus",             date: "06/09/2026" },
  { id: 14, dispatcher: "Marcus Thompson", driverName: "Marcus Webb",         loadId: "LD-00157", brokerName: "Transplace",       origin: "Miami, FL",       destination: "Orlando, FL",        rate: 620,  added: 0,    deducted: 0,   notes: "",                               date: "06/14/2026" },
  { id: 15, dispatcher: "Jake Reynolds",   driverName: "Linda Okafor",        loadId: "LD-01680", brokerName: "Coyote Logistics", origin: "San Diego, CA",   destination: "Las Vegas, NV",      rate: 1750, added: 250,  deducted: 0,   notes: "Oversize load bonus",            date: "06/16/2026" },
];

const DISPATCHERS = ["Jake Reynolds", "Sofia Reyes", "Marcus Thompson"];
const BROKERS     = ["Echo Global", "Coyote Logistics", "XPO Logistics", "Total Quality", "Mode Transport", "Arrive Logistics", "GlobalTranz", "RXO", "Uber Freight", "CH Robinson", "Schneider", "Landstar", "Transplace"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function net(p: Payout) { return p.rate + p.added - p.deducted; }

function fmtMoney(n: number, showSign = false) {
  const s = `$${Math.abs(n).toLocaleString()}`;
  if (!showSign) return s;
  return n >= 0 ? `+${s}` : `-${s}`;
}

// ─── Searchable select ────────────────────────────────────────────────────────

function SearchableSelect({ value, options, placeholder, onChange }: {
  value: string; options: string[]; placeholder: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filtered = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => { setOpen((v) => !v); setQ(""); }}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, color: value ? "var(--foreground)" : "var(--muted-foreground)", gap: 6, outline: "none" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || placeholder}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--muted-foreground)" }} />
      </button>
      {open && createPortal(
        <div style={{ position: "fixed", zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", width: 220, overflow: "hidden" }}
          ref={(el) => { if (el && ref.current) { const r = ref.current.getBoundingClientRect(); el.style.top = `${r.bottom + 4}px`; el.style.left = `${r.left}px`; } }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ padding: "10px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>No results</div>}
            {filtered.map((o) => (
              <div key={o} onMouseDown={() => { onChange(o); setOpen(false); }}
                style={{ padding: "8px 12px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", cursor: "pointer", backgroundColor: o === value ? "var(--muted)" : "transparent", display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = o === value ? "var(--muted)" : "transparent"; }}>
                {o === value && <Check size={11} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                <span style={{ marginLeft: o === value ? 0 : 17 }}>{o}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

const EMPTY_FORM = { dispatcher: "", driverName: "", loadId: "", brokerName: "", origin: "", destination: "", rate: "", added: "", deducted: "", notes: "", date: "" };
type FormState = typeof EMPTY_FORM;

function PayoutModal({ payout, onSave, onClose }: {
  payout?: Payout; onSave: (p: Omit<Payout, "id">) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    payout
      ? { ...payout, rate: String(payout.rate), added: String(payout.added), deducted: String(payout.deducted) }
      : EMPTY_FORM
  );

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.dispatcher && form.driverName && form.loadId && form.brokerName && form.rate && form.date;

  const handleSave = () => {
    if (!valid) return;
    onSave({
      dispatcher:  form.dispatcher,
      driverName:  form.driverName,
      loadId:      form.loadId.trim().toUpperCase(),
      brokerName:  form.brokerName,
      origin:      form.origin.trim(),
      destination: form.destination.trim(),
      rate:        Number(form.rate) || 0,
      added:       Number(form.added) || 0,
      deducted:    Number(form.deducted) || 0,
      notes:       form.notes.trim(),
      date:        form.date.trim(),
    });
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );

  const Input = ({ field, placeholder, type = "text", mono = false }: { field: keyof FormState; placeholder?: string; type?: string; mono?: boolean }) => (
    <input
      type={type}
      value={form[field]}
      onChange={(e) => set(field, e.target.value)}
      placeholder={placeholder}
      style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" }}
    />
  );

  const previewNet = (Number(form.rate) || 0) + (Number(form.added) || 0) - (Number(form.deducted) || 0);

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 400 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 560, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={17} style={{ color: "#10B981" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>{payout ? "Edit Payout" : "Add Payout"}</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>Fill in the payout details below</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 7, backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Row 1: Dispatcher + Driver */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Dispatcher">
              <SearchableSelect value={form.dispatcher} options={DISPATCHERS} placeholder="Select dispatcher" onChange={(v) => set("dispatcher", v)} />
            </Field>
            <Field label="Driver Name">
              <Input field="driverName" placeholder="e.g. Carlos Mendez" />
            </Field>
          </div>

          {/* Row 2: Load ID + Broker */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Load ID">
              <Input field="loadId" placeholder="e.g. LD-00481" mono />
            </Field>
            <Field label="Broker Name">
              <SearchableSelect value={form.brokerName} options={BROKERS} placeholder="Select broker" onChange={(v) => set("brokerName", v)} />
            </Field>
          </div>

          {/* Row 3: Origin + Destination */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Origin">
              <Input field="origin" placeholder="e.g. Dallas, TX" />
            </Field>
            <Field label="Destination">
              <Input field="destination" placeholder="e.g. Memphis, TN" />
            </Field>
          </div>

          {/* Row 4: Rate + Added + Deducted */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Rate ($)">
              <Input field="rate" type="number" placeholder="0" mono />
            </Field>
            <Field label="Added ($)">
              <Input field="added" type="number" placeholder="0" mono />
            </Field>
            <Field label="Deducted ($)">
              <Input field="deducted" type="number" placeholder="0" mono />
            </Field>
          </div>

          {/* Net preview */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Net Payout:</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: previewNet >= 0 ? "#10B981" : "#EF4444" }}>{fmtMoney(previewNet)}</span>
          </div>

          {/* Row 5: Date + Notes */}
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
            <Field label="Date">
              <Input field="date" placeholder="MM/DD/YYYY" />
            </Field>
            <Field label="Notes">
              <Input field="notes" placeholder="Optional notes…" />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!valid}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", backgroundColor: valid ? "var(--primary)" : "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: valid ? "#fff" : "var(--muted-foreground)", cursor: valid ? "pointer" : "not-allowed" }}>
            {payout ? "Save Changes" : "Add Payout"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ payout, onConfirm, onClose }: { payout: Payout; onConfirm: () => void; onClose: () => void }) {
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 500 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 501, width: 360, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", padding: "24px 24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>Delete Payout?</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            This will permanently remove the payout for <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{payout.driverName}</span> on load <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--primary)" }}>{payout.loadId}</span>.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: "7px 16px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding: "7px 16px", borderRadius: 7, border: "none", backgroundColor: "#EF4444", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
            Delete
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────

function TH({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: "left" | "right" | "center" }) {
  return (
    <th style={{ width, minWidth: width, padding: "8px 14px", textAlign: align, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", position: "sticky", top: 0, zIndex: 2 }}>
      {children}
    </th>
  );
}

// ─── Compact select (rows per page) ──────────────────────────────────────────

function CompactSelect({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 8px 0 10px", fontFamily: "var(--font-sans)", fontSize: 12, backgroundColor: "var(--input-background)", border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`, borderRadius: 7, color: "var(--foreground)", cursor: "pointer", boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" }}>
        {value}
        <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden", minWidth: 72 }}>
          {options.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: o === value ? 600 : 400, color: o === value ? "var(--primary)" : "var(--foreground)", backgroundColor: o === value ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", outline: "none" }}
              onMouseEnter={(e) => { if (o !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { if (o !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              {o}
              {o === value && <Check size={12} style={{ color: "var(--primary)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage, onPageSize }: {
  page: number; total: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const PBtn = ({ children, active = false, disabled = false, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) => (
    <button onClick={onClick} disabled={disabled} style={{ minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px", border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)", backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1, outline: "none" }}>
      {children}
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Rows per page</span>
        <CompactSelect value={pageSize} options={PAGE_SIZES as unknown as number[]} onChange={(v) => { onPageSize(v); onPage(1); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
            : <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
        )}
        <PBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

type DateMode = "day" | "week" | "month";

function parseDate(str: string): Date | null {
  const [m, d, y] = str.split("/").map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  r.setHours(0, 0, 0, 0);
  return r;
}

function fmtDateLabel(mode: DateMode, anchor: Date): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (mode === "day") {
    return `${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`;
  }
  if (mode === "week") {
    const mon = startOfWeek(anchor);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMo = mon.getMonth() === sun.getMonth();
    return sameMo
      ? `${MONTHS[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`
      : `${MONTHS[mon.getMonth()]} ${mon.getDate()} – ${MONTHS[sun.getMonth()]} ${sun.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`;
  }
  return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

function shiftAnchor(mode: DateMode, anchor: Date, dir: -1 | 1): Date {
  const d = new Date(anchor);
  if (mode === "day")   d.setDate(d.getDate() + dir);
  if (mode === "week")  d.setDate(d.getDate() + dir * 7);
  if (mode === "month") d.setMonth(d.getMonth() + dir);
  return d;
}

function inRange(mode: DateMode, anchor: Date, str: string): boolean {
  const d = parseDate(str);
  if (!d) return false;
  if (mode === "day") {
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth() && d.getDate() === anchor.getDate();
  }
  if (mode === "week") {
    const mon = startOfWeek(anchor);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
    return d >= mon && d <= sun;
  }
  return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export function PayoutsPage() {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [payouts, setPayouts]       = useState<Payout[]>(INIT_PAYOUTS);
  const [search, setSearch]         = useState("");
  const [dispFilter, setDispFilter] = useState("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateMode, setDateMode]     = useState<DateMode | null>(null);
  const [anchor, setAnchor]         = useState<Date>(today);
  const [modal, setModal]           = useState<"add" | "edit" | null>(null);
  const [editing, setEditing]       = useState<Payout | null>(null);
  const [deleting, setDeleting]     = useState<Payout | null>(null);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState<PageSize>(20);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const h = (e: MouseEvent) => { if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  const q = search.trim().toLowerCase();
  const filtered = payouts.filter((p) => {
    const md = dispFilter === "All" || p.dispatcher === dispFilter;
    const mq = !q || [p.driverName, p.loadId, p.brokerName, p.dispatcher, p.origin, p.destination].some((s) => s.toLowerCase().includes(q));
    const mt = !dateMode || inRange(dateMode, anchor, p.date);
    return md && mq && mt;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalRate     = filtered.reduce((s, p) => s + p.rate, 0);
  const totalAdded    = filtered.reduce((s, p) => s + p.added, 0);
  const totalDeducted = filtered.reduce((s, p) => s + p.deducted, 0);
  const totalNet      = totalRate + totalAdded - totalDeducted;

  const handleAdd = (data: Omit<Payout, "id">) => {
    const id = Math.max(0, ...payouts.map((p) => p.id)) + 1;
    setPayouts((prev) => [{ id, ...data }, ...prev]);
    setModal(null);
    setPage(1);
  };

  const handleEdit = (data: Omit<Payout, "id">) => {
    if (!editing) return;
    setPayouts((prev) => prev.map((p) => p.id === editing.id ? { id: p.id, ...data } : p));
    setEditing(null);
    setModal(null);
  };

  const handleDelete = () => {
    if (!deleting) return;
    setPayouts((prev) => prev.filter((p) => p.id !== deleting.id));
    setDeleting(null);
  };

  const selectMode = (m: DateMode) => {
    if (dateMode === m) { setDateMode(null); } else { setDateMode(m); setAnchor(today); }
    setPage(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>

      {modal === "add"  && <PayoutModal onSave={handleAdd}  onClose={() => setModal(null)} />}
      {modal === "edit" && editing && <PayoutModal payout={editing} onSave={handleEdit} onClose={() => { setModal(null); setEditing(null); }} />}
      {deleting && <DeleteConfirm payout={deleting} onConfirm={handleDelete} onClose={() => setDeleting(null)} />}

      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search driver, load, broker…"
            style={{ width: "100%", height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
        </div>

        {/* Dispatcher filter */}
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: dispFilter !== "All" ? "var(--primary)" : "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: dispFilter !== "All" ? "#fff" : "var(--foreground)", cursor: "pointer", whiteSpace: "nowrap", outline: "none" }}>
            {dispFilter === "All" ? "All Dispatchers" : dispFilter.split(" ")[0]}
            <ChevronDown size={13} style={{ color: dispFilter !== "All" ? "#ffffffaa" : "var(--muted-foreground)" }} />
          </button>
          {filterOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 180, overflow: "hidden" }}>
              {["All", ...DISPATCHERS].map((d) => (
                <div key={d} onMouseDown={() => { setDispFilter(d); setFilterOpen(false); setPage(1); }}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", cursor: "pointer", backgroundColor: dispFilter === d ? "var(--muted)" : "transparent" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = dispFilter === d ? "var(--muted)" : "transparent"; }}>
                  {dispFilter === d && <Check size={12} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                  <span style={{ marginLeft: dispFilter === d ? 0 : 19 }}>{d === "All" ? "All Dispatchers" : d}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date range picker */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
          {(["day", "week", "month"] as DateMode[]).map((m) => (
            <button key={m} onClick={() => selectMode(m)}
              style={{ padding: "8px 14px", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: dateMode === m ? 700 : 500, color: dateMode === m ? "#fff" : "var(--muted-foreground)", backgroundColor: dateMode === m ? "var(--primary)" : "transparent", border: "none", borderRight: m !== "month" ? "1px solid var(--border)" : "none", cursor: "pointer", textTransform: "capitalize", outline: "none", transition: "background-color 0.12s" }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Date nav — only shown when a mode is active */}
        {dateMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
            <button onClick={() => { setAnchor((a) => shiftAnchor(dateMode, a, -1)); setPage(1); }}
              style={{ width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRight: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--foreground)", outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              <ChevronLeft size={14} />
            </button>
            <div style={{ padding: "0 14px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", lineHeight: "34px" }}>
              {fmtDateLabel(dateMode, anchor)}
            </div>
            <button onClick={() => { setAnchor((a) => shiftAnchor(dateMode, a, 1)); setPage(1); }}
              style={{ width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderLeft: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--foreground)", outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={() => setModal("add")}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", flexShrink: 0 }}>
          <Plus size={14} />
          Add Payout
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 160 }} />{/* Dispatcher */}
            <col style={{ width: 170 }} />{/* Driver */}
            <col style={{ width: 110 }} />{/* Load ID */}
            <col style={{ width: 150 }} />{/* Broker */}
            <col style={{ width: 220 }} />{/* Route */}
            <col style={{ width: 100 }} />{/* Rate */}
            <col style={{ width: 90 }} /> {/* Added */}
            <col style={{ width: 100 }} />{/* Deducted */}
            <col style={{ width: 110 }} />{/* Net */}
            <col style={{ width: 210 }} />{/* Notes */}
            <col style={{ width: 110 }} />{/* Date */}
            <col style={{ width: 80 }} /> {/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <TH>Dispatcher</TH>
              <TH>Driver Name</TH>
              <TH>Load ID</TH>
              <TH>Broker</TH>
              <TH>Route</TH>
              <TH align="right">Rate</TH>
              <TH align="right">Added</TH>
              <TH align="right">Deducted</TH>
              <TH align="right">Net</TH>
              <TH>Notes</TH>
              <TH>Date</TH>
              <TH align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "56px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--muted-foreground)" }}>
                  No payouts found.
                </td>
              </tr>
            )}
            {pageRows.map((p, idx) => {
              const rowNet = net(p);
              const TD = ({ children, align, noOverflow }: { children: React.ReactNode; align?: string; noOverflow?: boolean }) => (
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: (align as "left" | "right" | "center") ?? "left", ...(noOverflow ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }}>
                  {children}
                </td>
              );
              return (
                <tr key={p.id}
                  style={{ backgroundColor: idx % 2 === 0 ? "var(--card)" : "var(--background)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 0 ? "var(--card)" : "var(--background)"; }}>

                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{p.dispatcher}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{p.driverName}</span></TD>
                  <TD noOverflow><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>{p.loadId}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{p.brokerName}</span></TD>
                  <TD>
                    {p.origin && p.destination
                      ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}>
                          <span style={{ color: "var(--foreground)" }}>{p.origin}</span>
                          <span style={{ margin: "0 5px", color: "var(--muted-foreground)", opacity: 0.5 }}>→</span>
                          <span style={{ color: "var(--foreground)" }}>{p.destination}</span>
                        </span>
                      : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{fmtMoney(p.rate)}</span></TD>
                  <TD align="right">
                    {p.added > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>+{fmtMoney(p.added)}</span> : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right">
                    {p.deducted > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#EF4444" }}>-{fmtMoney(p.deducted)}</span> : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: rowNet >= p.rate ? "#10B981" : "#F59E0B" }}>{fmtMoney(rowNet)}</span></TD>
                  <TD>
                    {p.notes
                      ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <FileText size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>{p.notes}</span>
                        </span>
                      : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD noOverflow>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <CalendarDays size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{p.date}</span>
                    </span>
                  </TD>
                  <TD align="center" noOverflow>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <button onClick={() => { setEditing(p); setModal("edit"); }}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)", outline: "none" }}
                        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "var(--muted)"; b.style.color = "var(--foreground)"; }}
                        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "transparent"; b.style.color = "var(--muted-foreground)"; }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setDeleting(p)}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)", outline: "none" }}
                        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#FEE2E2"; b.style.color = "#EF4444"; b.style.borderColor = "#FECACA"; }}
                        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "transparent"; b.style.color = "var(--muted-foreground)"; b.style.borderColor = "var(--border)"; }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>

          {/* Totals footer */}
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: "var(--card)" }}>
                <td colSpan={5} style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>
                  Totals ({filtered.length} records)
                </td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{fmtMoney(totalRate)}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>{totalAdded > 0 ? `+${fmtMoney(totalAdded)}` : "—"}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#EF4444" }}>{totalDeducted > 0 ? `-${fmtMoney(totalDeducted)}` : "—"}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#10B981" }}>{fmtMoney(totalNet)}</td>
                <td colSpan={3} style={{ borderTop: "2px solid var(--border)" }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Pagination page={safePage} total={filtered.length} pageSize={pageSize} onPage={setPage} onPageSize={(s) => setPageSize(s as PageSize)} />

      </div>
      </div>
    </div>
  );
}

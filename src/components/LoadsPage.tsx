import { useState, useRef, useEffect } from "react";
import {
  Package, Plus, Pencil, Trash2, X, Check, MapPin,
  Search, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Sparkles,
  ArrowLeft, ArrowRight, Building2, User, DollarSign, Clock, History,
} from "lucide-react";
import { Status, STATUS_CONFIG as SHARED_STATUS_CONFIG, ALL_STATUSES as SHARED_ALL_STATUSES } from "../lib/statuses";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Load {
  id: number;
  loadId: string;
  broker: string;
  driver: string;
  status: Status;
  pickupAppt: string;
  dropAppt: string;
  origin: string;
  destination: string;
  payout: number;
  dispatcher: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface SelectOpt { value: string; label: string; dot?: string }

const LOADS_STATUSES: Status[] = ["re_update", "reserved", "dispatched", "enroute", "delivered", "completed"];

const STATUS_FILTER_OPTS: SelectOpt[] = [
  { value: "All", label: "All Statuses" },
  ...LOADS_STATUSES.map((s) => ({ value: s, label: SHARED_STATUS_CONFIG[s].label })),
];
const STATUS_MODAL_OPTS: SelectOpt[] = SHARED_ALL_STATUSES.map((s) => ({ value: s, label: SHARED_STATUS_CONFIG[s].label }));

// ─── Seed data ────────────────────────────────────────────────────────────────

const initLoads: Load[] = [
  { id: 1,  loadId: "LD-00481", broker: "Echo Global",      driver: "Carlos Mendez",       status: "enroute",     pickupAppt: "06/12 · 08:00", dropAppt: "06/12 · 17:30", origin: "Dallas, TX",       destination: "Memphis, TN",       payout: 1850, dispatcher: "Jake R."   },
  { id: 2,  loadId: "LD-00290", broker: "Coyote Logistics", driver: "Angela Torres",        status: "delivered",   pickupAppt: "06/11 · 07:00", dropAppt: "06/11 · 16:00", origin: "Chicago, IL",      destination: "Indianapolis, IN",  payout: 1200, dispatcher: "Sofia R."  },
  { id: 3,  loadId: "LD-00813", broker: "XPO Logistics",    driver: "Darnell Washington",   status: "dispatched",  pickupAppt: "06/12 · 11:00", dropAppt: "06/12 · 16:00", origin: "Atlanta, GA",      destination: "Nashville, TN",     payout: 950,  dispatcher: "Marcus T." },
  { id: 4,  loadId: "LD-00577", broker: "Total Quality",    driver: "Priya Sharma",         status: "enroute",     pickupAppt: "06/12 · 14:30", dropAppt: "06/13 · 07:00", origin: "Houston, TX",      destination: "San Antonio, TX",   payout: 750,  dispatcher: "Jake R."   },
  { id: 5,  loadId: "LD-00342", broker: "Mode Transport",   driver: "Marcus Webb",          status: "delivered",   pickupAppt: "06/11 · 09:00", dropAppt: "06/12 · 10:45", origin: "Phoenix, AZ",      destination: "Los Angeles, CA",   payout: 2100, dispatcher: "Sofia R."  },
  { id: 6,  loadId: "LD-00610", broker: "Arrive Logistics", driver: "Linda Okafor",         status: "enroute",     pickupAppt: "06/12 · 06:30", dropAppt: "06/12 · 19:00", origin: "Denver, CO",       destination: "Kansas City, MO",   payout: 1400, dispatcher: "Marcus T." },
  { id: 7,  loadId: "LD-00924", broker: "GlobalTranz",      driver: "Ray Kowalski",         status: "reserved",    pickupAppt: "06/13 · 08:00", dropAppt: "06/13 · 15:30", origin: "Las Vegas, NV",    destination: "Salt Lake City, UT",payout: 880,  dispatcher: "Jake R."   },
  { id: 8,  loadId: "LD-00157", broker: "Transplace",       driver: "—",                    status: "reserved",    pickupAppt: "06/14 · 09:00", dropAppt: "06/14 · 18:00", origin: "Miami, FL",        destination: "Orlando, FL",       payout: 620,  dispatcher: "Sofia R."  },
  { id: 9,  loadId: "LD-01024", broker: "RXO",              driver: "Jean Eddy Simon",      status: "dispatched",  pickupAppt: "06/13 · 06:00", dropAppt: "06/14 · 08:00", origin: "Nashville, TN",    destination: "Charlotte, NC",     payout: 1650, dispatcher: "Marcus T." },
  { id: 10, loadId: "LD-01105", broker: "Uber Freight",     driver: "Keavis Dyer",          status: "enroute",     pickupAppt: "06/12 · 10:00", dropAppt: "06/13 · 14:00", origin: "Columbus, OH",     destination: "Pittsburgh, PA",    payout: 980,  dispatcher: "Jake R."   },
  { id: 11, loadId: "LD-01233", broker: "CH Robinson",      driver: "Shokhnurbek Komilov",  status: "delivered",   pickupAppt: "06/10 · 07:30", dropAppt: "06/11 · 12:00", origin: "Seattle, WA",      destination: "Portland, OR",      payout: 540,  dispatcher: "Sofia R."  },
  { id: 12, loadId: "LD-01344", broker: "Schneider",        driver: "Bakhodir Azamov",      status: "delivered",   pickupAppt: "06/11 · 08:00", dropAppt: "06/12 · 09:00", origin: "Minneapolis, MN",  destination: "Chicago, IL",       payout: 1100, dispatcher: "Marcus T." },
  { id: 13, loadId: "LD-01412", broker: "Landstar",         driver: "Tomás García",         status: "re_update",   pickupAppt: "06/12 · 08:00", dropAppt: "06/12 · 14:00", origin: "Detroit, MI",      destination: "Cleveland, OH",     payout: 0,    dispatcher: "Jake R."   },
  { id: 14, loadId: "LD-01551", broker: "Echo Global",      driver: "Carlos Mendez",        status: "re_update",   pickupAppt: "06/09 · 10:00", dropAppt: "06/09 · 16:00", origin: "St. Louis, MO",    destination: "Kansas City, MO",   payout: 150,  dispatcher: "Sofia R."  },
  { id: 15, loadId: "LD-01680", broker: "Coyote Logistics", driver: "—",                    status: "reserved",    pickupAppt: "06/15 · 07:00", dropAppt: "06/16 · 11:00", origin: "San Diego, CA",    destination: "Las Vegas, NV",     payout: 1750, dispatcher: "Marcus T." },
];

// ─── Change log ───────────────────────────────────────────────────────────────

type ChangeType = "created" | "status" | "assigned" | "edited";

interface ChangeEntry {
  id: number;
  timestamp: string;
  action: string;
  by: string;
  type: ChangeType;
  status?: Status;
}

const LOAD_CHANGE_LOG: Record<number, ChangeEntry[]> = {
  1:  [
    { id: 1, timestamp: "Jun 10, 2026 · 09:14 AM", action: "Load created",                          by: "Jake R.",            type: "created"  },
    { id: 2, timestamp: "Jun 10, 2026 · 09:14 AM", action: "Status set to Reserved",                by: "Jake R.",            type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 11, 2026 · 02:30 PM", action: "Driver assigned: Carlos Mendez",        by: "Jake R.",            type: "assigned" },
    { id: 4, timestamp: "Jun 11, 2026 · 02:31 PM", action: "Status changed to Dispatched",          by: "Jake R.",            type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 12, 2026 · 08:05 AM", action: "Status changed to Enroute",             by: "Carlos Mendez",      type: "status",  status: "enroute" },
  ],
  2:  [
    { id: 1, timestamp: "Jun 9,  2026 · 03:00 PM", action: "Load created",                          by: "Sofia R.",           type: "created"  },
    { id: 2, timestamp: "Jun 9,  2026 · 03:00 PM", action: "Status set to Reserved",                by: "Sofia R.",           type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 10, 2026 · 10:00 AM", action: "Driver assigned: Angela Torres",        by: "Sofia R.",           type: "assigned" },
    { id: 4, timestamp: "Jun 10, 2026 · 10:01 AM", action: "Status changed to Dispatched",          by: "Sofia R.",           type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 11, 2026 · 07:02 AM", action: "Status changed to Enroute",             by: "Angela Torres",      type: "status",  status: "enroute" },
    { id: 6, timestamp: "Jun 11, 2026 · 04:05 PM", action: "Status changed to Delivered",           by: "Angela Torres",      type: "status",  status: "delivered"  },
  ],
  3:  [
    { id: 1, timestamp: "Jun 11, 2026 · 11:00 AM", action: "Load created",                          by: "Marcus T.",          type: "created"  },
    { id: 2, timestamp: "Jun 11, 2026 · 11:00 AM", action: "Status set to Reserved",                by: "Marcus T.",          type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 12, 2026 · 09:15 AM", action: "Driver assigned: Darnell Washington",   by: "Marcus T.",          type: "assigned" },
    { id: 4, timestamp: "Jun 12, 2026 · 09:16 AM", action: "Status changed to Dispatched",          by: "Marcus T.",          type: "status",  status: "dispatched"   },
  ],
  4:  [
    { id: 1, timestamp: "Jun 11, 2026 · 08:00 AM", action: "Load created",                          by: "Jake R.",            type: "created"  },
    { id: 2, timestamp: "Jun 11, 2026 · 08:00 AM", action: "Status set to Reserved",                by: "Jake R.",            type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 12, 2026 · 12:00 PM", action: "Driver assigned: Priya Sharma",         by: "Jake R.",            type: "assigned" },
    { id: 4, timestamp: "Jun 12, 2026 · 12:01 PM", action: "Status changed to Dispatched",          by: "Jake R.",            type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 12, 2026 · 02:35 PM", action: "Status changed to Enroute",             by: "Priya Sharma",       type: "status",  status: "enroute" },
  ],
  5:  [
    { id: 1, timestamp: "Jun 9,  2026 · 02:00 PM", action: "Load created",                          by: "Sofia R.",           type: "created"  },
    { id: 2, timestamp: "Jun 9,  2026 · 02:00 PM", action: "Status set to Reserved",                by: "Sofia R.",           type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 10, 2026 · 04:00 PM", action: "Driver assigned: Marcus Webb",          by: "Sofia R.",           type: "assigned" },
    { id: 4, timestamp: "Jun 10, 2026 · 04:01 PM", action: "Status changed to Dispatched",          by: "Sofia R.",           type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 11, 2026 · 09:03 AM", action: "Status changed to Enroute",             by: "Marcus Webb",        type: "status",  status: "enroute" },
    { id: 6, timestamp: "Jun 12, 2026 · 10:48 AM", action: "Status changed to Delivered",           by: "Marcus Webb",        type: "status",  status: "delivered"  },
  ],
  6:  [
    { id: 1, timestamp: "Jun 11, 2026 · 10:00 AM", action: "Load created",                          by: "Marcus T.",          type: "created"  },
    { id: 2, timestamp: "Jun 11, 2026 · 10:00 AM", action: "Status set to Reserved",                by: "Marcus T.",          type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 12, 2026 · 05:00 AM", action: "Driver assigned: Linda Okafor",         by: "Marcus T.",          type: "assigned" },
    { id: 4, timestamp: "Jun 12, 2026 · 05:01 AM", action: "Status changed to Dispatched",          by: "Marcus T.",          type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 12, 2026 · 06:33 AM", action: "Status changed to Enroute",             by: "Linda Okafor",       type: "status",  status: "enroute" },
  ],
  7:  [
    { id: 1, timestamp: "Jun 12, 2026 · 11:00 AM", action: "Load created",                          by: "Jake R.",            type: "created"  },
    { id: 2, timestamp: "Jun 12, 2026 · 11:00 AM", action: "Status set to Reserved",                by: "Jake R.",            type: "status",  status: "reserved"    },
  ],
  8:  [
    { id: 1, timestamp: "Jun 13, 2026 · 09:00 AM", action: "Load created",                          by: "Sofia R.",           type: "created"  },
    { id: 2, timestamp: "Jun 13, 2026 · 09:00 AM", action: "Status set to Reserved",                by: "Sofia R.",           type: "status",  status: "reserved"    },
  ],
  9:  [
    { id: 1, timestamp: "Jun 11, 2026 · 04:00 PM", action: "Load created",                          by: "Marcus T.",          type: "created"  },
    { id: 2, timestamp: "Jun 11, 2026 · 04:00 PM", action: "Status set to Reserved",                by: "Marcus T.",          type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 12, 2026 · 02:00 PM", action: "Driver assigned: Jean Eddy Simon",      by: "Marcus T.",          type: "assigned" },
    { id: 4, timestamp: "Jun 12, 2026 · 02:01 PM", action: "Status changed to Dispatched",          by: "Marcus T.",          type: "status",  status: "dispatched"   },
  ],
  10: [
    { id: 1, timestamp: "Jun 11, 2026 · 09:00 AM", action: "Load created",                          by: "Jake R.",            type: "created"  },
    { id: 2, timestamp: "Jun 11, 2026 · 09:00 AM", action: "Status set to Reserved",                by: "Jake R.",            type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 12, 2026 · 08:00 AM", action: "Driver assigned: Keavis Dyer",          by: "Jake R.",            type: "assigned" },
    { id: 4, timestamp: "Jun 12, 2026 · 08:01 AM", action: "Status changed to Dispatched",          by: "Jake R.",            type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 12, 2026 · 10:05 AM", action: "Status changed to Enroute",             by: "Keavis Dyer",        type: "status",  status: "enroute" },
  ],
  11: [
    { id: 1, timestamp: "Jun 8,  2026 · 02:00 PM", action: "Load created",                          by: "Sofia R.",           type: "created"  },
    { id: 2, timestamp: "Jun 8,  2026 · 02:00 PM", action: "Status set to Reserved",                by: "Sofia R.",           type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 9,  2026 · 06:00 PM", action: "Driver assigned: Shokhnurbek Komilov",  by: "Sofia R.",           type: "assigned" },
    { id: 4, timestamp: "Jun 9,  2026 · 06:01 PM", action: "Status changed to Dispatched",          by: "Sofia R.",           type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 10, 2026 · 07:33 AM", action: "Status changed to Enroute",             by: "Shokhnurbek Komilov",type: "status",  status: "enroute" },
    { id: 6, timestamp: "Jun 11, 2026 · 12:04 PM", action: "Status changed to Delivered",           by: "Shokhnurbek Komilov",type: "status",  status: "delivered"  },
  ],
  12: [
    { id: 1, timestamp: "Jun 9,  2026 · 11:00 AM", action: "Load created",                          by: "Marcus T.",          type: "created"  },
    { id: 2, timestamp: "Jun 9,  2026 · 11:00 AM", action: "Status set to Reserved",                by: "Marcus T.",          type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 10, 2026 · 03:00 PM", action: "Driver assigned: Bakhodir Azamov",      by: "Marcus T.",          type: "assigned" },
    { id: 4, timestamp: "Jun 10, 2026 · 03:01 PM", action: "Status changed to Dispatched",          by: "Marcus T.",          type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 11, 2026 · 08:02 AM", action: "Status changed to Enroute",             by: "Bakhodir Azamov",    type: "status",  status: "enroute" },
    { id: 6, timestamp: "Jun 12, 2026 · 09:03 AM", action: "Status changed to Delivered",           by: "Bakhodir Azamov",    type: "status",  status: "delivered"  },
  ],
  13: [
    { id: 1, timestamp: "Jun 10, 2026 · 10:00 AM", action: "Load created",                          by: "Jake R.",            type: "created"  },
    { id: 2, timestamp: "Jun 10, 2026 · 10:00 AM", action: "Status set to Reserved",                by: "Jake R.",            type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 11, 2026 · 12:00 PM", action: "Driver assigned: Tomás García",         by: "Jake R.",            type: "assigned" },
    { id: 4, timestamp: "Jun 11, 2026 · 12:01 PM", action: "Status changed to Dispatched",          by: "Jake R.",            type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 12, 2026 · 07:30 AM", action: "Status changed to Re-Update",           by: "Jake R.",            type: "status",  status: "re_update"  },
    { id: 6, timestamp: "Jun 12, 2026 · 07:31 AM", action: "Note added: Broker cancelled the load", by: "Jake R.",            type: "edited"   },
  ],
  14: [
    { id: 1, timestamp: "Jun 7,  2026 · 09:00 AM", action: "Load created",                          by: "Sofia R.",           type: "created"  },
    { id: 2, timestamp: "Jun 7,  2026 · 09:00 AM", action: "Status set to Reserved",                by: "Sofia R.",           type: "status",  status: "reserved"    },
    { id: 3, timestamp: "Jun 8,  2026 · 03:00 PM", action: "Driver assigned: Carlos Mendez",        by: "Sofia R.",           type: "assigned" },
    { id: 4, timestamp: "Jun 8,  2026 · 03:01 PM", action: "Status changed to Dispatched",          by: "Sofia R.",           type: "status",  status: "dispatched"   },
    { id: 5, timestamp: "Jun 9,  2026 · 08:00 AM", action: "Status changed to Enroute",             by: "Carlos Mendez",      type: "status",  status: "enroute" },
    { id: 6, timestamp: "Jun 9,  2026 · 10:30 AM", action: "Status changed to Re-Update (TONU)",    by: "Sofia R.",           type: "status",  status: "re_update"       },
    { id: 7, timestamp: "Jun 9,  2026 · 10:31 AM", action: "Note added: Shipper no-show at dock",   by: "Sofia R.",           type: "edited"   },
  ],
  15: [
    { id: 1, timestamp: "Jun 13, 2026 · 02:00 PM", action: "Load created",                          by: "Marcus T.",          type: "created"  },
    { id: 2, timestamp: "Jun 13, 2026 · 02:00 PM", action: "Status set to Reserved",                by: "Marcus T.",          type: "status",  status: "reserved"    },
  ],
};

// ─── Custom Select ─────────────────────────────────────────────────────────────

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false,
}: {
  value: string; options: SelectOpt[]; onChange: (v: string) => void;
  width?: number | string; compact?: boolean; dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find((o) => o.value === value);
  const h = compact ? 30 : 34;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s", outline: "none",
        }}
      >
        {selected?.dot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: selected.dot, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          ...(dropUp ? { bottom: "calc(100% + 4px)", top: "auto" } : { top: "calc(100% + 4px)", bottom: "auto" }),
          left: 0, minWidth: "100%", width: "max-content",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden",
        }}>
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 12px",
                  fontFamily: "var(--font-sans)", fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--primary)" : "var(--foreground)",
                  backgroundColor: isActive ? "var(--accent)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left", outline: "none",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                {opt.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: opt.dot, flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

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

  const PBtn = ({ children, active = false, disabled = false, onClick }: {
    children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
  }) => (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px",
      border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
      backgroundColor: active ? "var(--primary)" : "transparent",
      color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: disabled ? "default" : "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      opacity: disabled ? 0.38 : 1, outline: "none", transition: "background-color 0.1s",
    }}>
      {children}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderTop: "1px solid var(--border)",
      backgroundColor: "var(--card)", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          Rows per page
        </span>
        <CustomSelect
          value={String(pageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => { onPageSize(Number(v)); onPage(1); }}
          width={72} compact dropUp
        />
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

// ─── Shared table primitives ───────────────────────────────────────────────────

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: string }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center" | "right",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
  }}>
    {children}
  </th>
);

function StatusBadge({ status }: { status: Status }) {
  const c = SHARED_STATUS_CONFIG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
      color: c.color, backgroundColor: c.bg,
      borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 6, border: "none",
      backgroundColor: bg, color, cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      transition: "opacity 0.15s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >
      {icon}
    </button>
  );
}

function fmt(n: number) {
  return n === 0 ? "—" : `$${n.toLocaleString()}`;
}

// ─── Add Menu ─────────────────────────────────────────────────────────────────

function AddLoadMenu({ onManual }: { onManual: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items = [
    {
      icon: <ClipboardList size={16} />,
      iconColor: "var(--primary)", iconBg: "var(--secondary)",
      label: "Add Manually",
      desc: "Fill in load details using the form",
      comingSoon: false,
      onClick: onManual,
    },
    {
      icon: <Sparkles size={16} />,
      iconColor: "#7C3AED", iconBg: "#F5F3FF",
      label: "AI Smart Extract",
      desc: "Parse load info from any document or email",
      comingSoon: true,
      onClick: () => {},
    },
  ];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
          height: 34, padding: "0 14px", borderRadius: 7, border: "none",
          backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", outline: "none",
        }}
      >
        <Plus size={14} />
        Create Load
        <span style={{ width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
        <ChevronDown size={13} style={{ opacity: 0.85, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          width: 270, backgroundColor: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200,
          padding: 6, display: "flex", flexDirection: "column", gap: 2,
        }}>
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { if (!item.comingSoon) { item.onClick(); setOpen(false); } }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: "9px 10px", borderRadius: 7,
                border: "none", textAlign: "left", cursor: item.comingSoon ? "default" : "pointer",
                backgroundColor: "transparent", opacity: item.comingSoon ? 0.6 : 1,
                outline: "none", transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => { if (!item.comingSoon) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                backgroundColor: item.iconBg, color: item.iconColor,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {item.label}
                  </span>
                  {item.comingSoon && (
                    <span style={{
                      fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
                      color: "#7C3AED", backgroundColor: "#F5F3FF",
                      borderRadius: 4, padding: "1px 6px", letterSpacing: "0.04em",
                    }}>
                      SOON
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LoadModal({ load, onClose, onSave }: {
  load: Partial<Load>; onClose: () => void; onSave: (l: Load) => void;
}) {
  const [form, setForm] = useState<Partial<Load>>(load);
  const set = <K extends keyof Load>(k: K, v: Load[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !load.id;

  const inputStyle = {
    fontFamily: "var(--font-sans)", fontSize: 13,
    padding: "7px 10px", borderRadius: 6, height: 34,
    border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
    color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" as const,
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const labelStyle = { display: "flex" as const, flexDirection: "column" as const, gap: 5 };
  const capStyle = { fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
  };
  const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "visible", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} style={{ color: "var(--primary)" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              {isNew ? "Create Load" : `Edit ${load.loadId}`}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, overflowY: "auto" }}>
          <label style={labelStyle}>
            <span style={capStyle}>Load ID</span>
            <input value={form.loadId ?? ""} onChange={(e) => set("loadId", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="LD-00000" onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Broker</span>
            <input value={form.broker ?? ""} onChange={(e) => set("broker", e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Driver</span>
            <input value={form.driver ?? ""} onChange={(e) => set("driver", e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Dispatcher</span>
            <input value={form.dispatcher ?? ""} onChange={(e) => set("dispatcher", e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Status</span>
            <CustomSelect
              value={form.status ?? "reserved"}
              options={STATUS_MODAL_OPTS}
              onChange={(v) => set("status", v as Status)}
            />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Payout ($)</span>
            <input type="number" value={form.payout ?? ""} onChange={(e) => set("payout", Number(e.target.value))} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="0" onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Pickup Appt</span>
            <input value={form.pickupAppt ?? ""} onChange={(e) => set("pickupAppt", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="06/12 · 08:00" onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Drop Appt</span>
            <input value={form.dropAppt ?? ""} onChange={(e) => set("dropAppt", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="06/12 · 17:00" onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Origin</span>
            <input value={form.origin ?? ""} onChange={(e) => set("origin", e.target.value)} style={inputStyle} placeholder="City, ST" onFocus={focusInput} onBlur={blurInput} />
          </label>
          <label style={labelStyle}>
            <span style={capStyle}>Destination</span>
            <input value={form.destination ?? ""} onChange={(e) => set("destination", e.target.value)} style={inputStyle} placeholder="City, ST" onFocus={focusInput} onBlur={blurInput} />
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
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

// ─── Load Detail ──────────────────────────────────────────────────────────────

const CHANGE_DOT: Record<ChangeType, string> = {
  created:  "#2563EB",
  status:   "#6B7280",
  assigned: "#7C3AED",
  edited:   "#9CA3AF",
};

function LoadDetail({ load, onBack }: { load: Load; onBack: () => void }) {
  const [tab, setTab] = useState<"info" | "log">("info");
  const log = [...(LOAD_CHANGE_LOG[load.id] ?? [])].reverse();

  const infoRows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Building2 size={13} />, label: "Broker",     value: load.broker },
    {
      icon: <User size={13} />,
      label: "Driver",
      value: load.driver === "—"
        ? <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>
        : load.driver,
    },
    { icon: <User size={13} />,       label: "Dispatcher", value: load.dispatcher },
    {
      icon: <DollarSign size={13} />,
      label: "Payout",
      value: (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: load.payout === 0 ? "var(--muted-foreground)" : "#10B981" }}>
          {load.payout === 0 ? "—" : `$${load.payout.toLocaleString()}`}
        </span>
      ),
    },
  ];

  const tabs = [
    { id: "info" as const, label: "Load Info",   icon: <Package  size={14} /> },
    { id: "log"  as const, label: "Change Log",  icon: <History  size={14} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sub-header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px", borderBottom: "1px solid var(--border)",
        backgroundColor: "var(--muted)", flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "3px 7px", borderRadius: 6, outline: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <ArrowLeft size={14} /> Loads
        </button>
        <span style={{ color: "var(--border)", fontSize: 14, userSelect: "none" }}>/</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>
          {load.loadId}
        </span>
        <StatusBadge status={load.status} />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, padding: "0 16px", backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "10px 14px",
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                backgroundColor: "transparent", border: "none",
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1, outline: "none", transition: "all 0.15s",
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

        {/* ── Load Info tab ── */}
        {tab === "info" && (
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

            {/* Left: people & financials */}
            <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {infoRows.map((row, i) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: i < infoRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ color: "var(--muted-foreground)", marginTop: 1, flexShrink: 0 }}>{row.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                        {row.label}
                      </div>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>
                        {row.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: route + appointments */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Route card */}
              <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                  Route
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {/* Origin */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#10B981", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.07em" }}>Origin</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>{load.origin}</div>
                  </div>

                  {/* Arrow */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <ArrowRight size={20} style={{ color: "var(--muted-foreground)" }} />
                  </div>

                  {/* Destination */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#EF4444", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.07em" }}>Destination</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>{load.destination}</div>
                  </div>
                </div>
              </div>

              {/* Appointments card */}
              <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {[
                  { label: "Pickup Appointment", time: load.pickupAppt, tag: "PU", tagColor: "#10B981", tagBg: "#D1FAE5" },
                  { label: "Drop Appointment",   time: load.dropAppt,   tag: "DR", tagColor: "#EF4444", tagBg: "#FEE2E2" },
                ].map((appt, i, arr) => (
                  <div key={appt.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <Clock size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
                        {appt.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: appt.tagColor, backgroundColor: appt.tagBg, borderRadius: 3, padding: "1px 6px" }}>
                          {appt.tag}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)" }}>{appt.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Change Log tab ── */}
        {tab === "log" && (
          <div style={{ maxWidth: 640 }}>
            {log.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                No change log entries.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {log.map((entry, i) => {
                  const dotColor = entry.type === "status" && entry.status
                    ? SHARED_STATUS_CONFIG[entry.status].bg
                    : CHANGE_DOT[entry.type];
                  const isLast = i === log.length - 1;
                  return (
                    <div key={entry.id} style={{ display: "flex", gap: 16, position: "relative" }}>
                      {/* Timeline spine */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 16 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: dotColor, border: "2px solid var(--card)", boxShadow: `0 0 0 2px ${dotColor}`, marginTop: 14, flexShrink: 0 }} />
                        {!isLast && <div style={{ width: 2, flex: 1, backgroundColor: "var(--border)", minHeight: 20, marginTop: 4 }} />}
                      </div>

                      {/* Entry content */}
                      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20, paddingTop: 10 }}>
                        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>
                          {entry.action}
                          {entry.type === "status" && entry.status && (
                            <span style={{ marginLeft: 8 }}>
                              <StatusBadge status={entry.status} />
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                            {entry.timestamp}
                          </span>
                          <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>
                            by <strong style={{ color: "var(--foreground)" }}>{entry.by}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoadsPage() {
  const [loads, setLoads]           = useState<Load[]>(initLoads);
  const [modal, setModal]           = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]       = useState<Partial<Load>>({});
  const [deleting, setDeleting]     = useState<Load | null>(null);
  const [filterStatus, setFilter]   = useState("All");
  const [search, setSearch]         = useState("");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [detailLoad, setDetail]     = useState<Load | null>(null);

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

  const q = search.toLowerCase();
  const filtered = loads.filter((l) => {
    const ms = !q || l.loadId.toLowerCase().includes(q) || l.broker.toLowerCase().includes(q) || l.driver.toLowerCase().includes(q) || l.origin.toLowerCase().includes(q) || l.destination.toLowerCase().includes(q);
    const mf = filterStatus === "All" || l.status === filterStatus;
    return ms && mf;
  });
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSearch = (v: string) => { setSearch(v);  setPage(1); };
  const handleFilter = (v: string) => { setFilter(v);  setPage(1); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
        }}>
          {detailLoad ? (
            <LoadDetail load={detailLoad} onBack={() => setDetail(null)} />
          ) : (<>

          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--card)", flexShrink: 0,
          }}>
            {/* Search */}
            <div style={{ position: "relative", flex: "0 0 260px" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search loads, brokers, drivers…"
                style={{
                  width: "100%", height: 34, paddingLeft: 30, paddingRight: 10,
                  fontFamily: "var(--font-sans)", fontSize: 13,
                  backgroundColor: "var(--input-background)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--foreground)", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Status filter */}
            <CustomSelect
              value={filterStatus}
              options={STATUS_FILTER_OPTS}
              onChange={handleFilter}
              width={172}
            />

            <div style={{ flex: 1 }} />

            <AddLoadMenu onManual={openCreate} />
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse" }}>
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
                {paged.map((l, i) => (
                  <tr
                    key={l.id}
                    style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
                  >
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", verticalAlign: "middle" }}>
                      {l.id}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <button
                        onClick={() => setDetail(l)}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px", border: "none", cursor: "pointer", outline: "none" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                      >
                        {l.loadId}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", verticalAlign: "middle" }}>
                      {l.broker}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: l.driver === "—" ? "var(--muted-foreground)" : "var(--foreground)", fontStyle: l.driver === "—" ? "italic" : "normal" }}>
                        {l.driver === "—" ? "Unassigned" : l.driver}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <StatusBadge status={l.status} />
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
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
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <MapPin size={11} style={{ color: "#10B981", flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", whiteSpace: "nowrap" }}>{l.origin}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <MapPin size={11} style={{ color: "#EF4444", flexShrink: 0 }} />
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", whiteSpace: "nowrap" }}>{l.destination}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "right" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                        color: l.payout === 0 ? "var(--muted-foreground)" : l.status === "re_update" ? "#EF4444" : "#10B981",
                      }}>
                        {fmt(l.payout)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{l.dispatcher}</span>
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", gap: 5 }}>
                        <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(l)} />
                        <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(l)} />
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                      No loads match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page} total={filtered.length} pageSize={pageSize}
            onPage={setPage} onPageSize={setPageSize}
          />
          </>)}
        </div>
      </div>

      {(modal === "create" || modal === "edit") && (
        <LoadModal load={editing} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.loadId} onClose={() => setDeleting(null)} onConfirm={del} />
      )}
    </div>
  );
}

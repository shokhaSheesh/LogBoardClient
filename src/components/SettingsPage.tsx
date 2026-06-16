import { useState, useRef, useEffect } from "react";
import {
  Users, UsersRound, ShieldCheck, Plus, Pencil, Trash2, X, Check,
  Eye, EyeOff, ToggleLeft, ToggleRight, Search, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserStatus = "Active" | "Inactive";

const PAGES = ["Board", "Gross", "Loads", "Drivers", "Equipments", "Settings"] as const;
type PageName = typeof PAGES[number];
type CRUDKey = "create" | "read" | "update" | "delete";
const CRUD_KEYS: CRUDKey[] = ["create", "read", "update", "delete"];
type Permissions = Record<PageName, Record<CRUDKey, boolean>>;

interface Role {
  id: number;
  name: string;
  permissions: Permissions;
}

interface Team {
  id: number;
  name: string;
  userIds: number[];
  driverNames: string[];
}

interface User {
  id: number;
  name: string;
  phone: string;
  workDays: string;
  workFrom: string;
  workTo: string;
  roleId: number;
  teamId: number | null;
  login: string;
  password: string;
  status: UserStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fullPerms(): Permissions {
  return Object.fromEntries(
    PAGES.map((p) => [p, { create: true, read: true, update: true, delete: true }])
  ) as Permissions;
}
function readOnly(): Permissions {
  return Object.fromEntries(
    PAGES.map((p) => [p, { create: false, read: true, update: false, delete: false }])
  ) as Permissions;
}
function dispatcherPerms(): Permissions {
  const p = readOnly();
  (["Board","Loads","Drivers"] as PageName[]).forEach((page) => {
    p[page].create = true; p[page].update = true;
  });
  return p;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const initRoles: Role[] = [
  { id: 1, name: "Admin",      permissions: fullPerms() },
  { id: 2, name: "Dispatcher", permissions: dispatcherPerms() },
  { id: 3, name: "Viewer",     permissions: readOnly() },
];

const initTeams: Team[] = [
  { id: 1, name: "Alpha Team",   userIds: [1, 2],    driverNames: ["Carlos Mendez", "Angela Torres", "Darnell Washington"] },
  { id: 2, name: "Bravo Team",   userIds: [3],       driverNames: ["Priya Sharma", "Marcus Webb"] },
  { id: 3, name: "Charlie Team", userIds: [4, 5],    driverNames: ["Linda Okafor", "Ray Kowalski", "Tomás García"] },
];

const initUsers: User[] = [
  { id: 1, name: "Jake Reynolds",    phone: "(214) 555-0010", workDays: "Mon–Fri", workFrom: "08:00", workTo: "17:00", roleId: 1, teamId: 1, login: "jake.r",    password: "Secure@123", status: "Active"   },
  { id: 2, name: "Sofia Reyes",      phone: "(312) 555-0022", workDays: "Mon–Sat", workFrom: "07:00", workTo: "16:00", roleId: 2, teamId: 1, login: "sofia.r",   password: "Disp#456",   status: "Active"   },
  { id: 3, name: "Marcus Thompson",  phone: "(404) 555-0033", workDays: "Mon–Fri", workFrom: "09:00", workTo: "18:00", roleId: 2, teamId: 2, login: "marcus.t",  password: "Mark$789",   status: "Active"   },
  { id: 4, name: "Olivia Chen",      phone: "(713) 555-0044", workDays: "Tue–Sat", workFrom: "10:00", workTo: "19:00", roleId: 2, teamId: 3, login: "olivia.c",  password: "Oliv!012",   status: "Active"   },
  { id: 5, name: "Diego Ramos",      phone: "(602) 555-0055", workDays: "Mon–Fri", workFrom: "08:00", workTo: "17:00", roleId: 3, teamId: 3, login: "diego.r",   password: "View%345",   status: "Inactive" },
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: string }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
  }}>{children}</th>
);

const TD = ({ children, mono = false, center = false, style: extra }: { children: React.ReactNode; mono?: boolean; center?: boolean; style?: React.CSSProperties }) => (
  <td style={{
    padding: "10px 14px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: mono ? 11 : 12, color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle", textAlign: center ? "center" : "left",
    ...extra,
  }}>{children}</td>
);

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, portal = false,
}: {
  value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; width?: number | string;
  compact?: boolean; dropUp?: boolean;
  portal?: boolean; // escape overflow:hidden containers (use inside modals)
}) {
  const [open, setOpen] = useState(false);
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleToggle = () => {
    if (!open && portal && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const goUp = spaceBelow < 200 && r.top > 200;
      setFixedPos({ top: goUp ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen((v) => !v);
  };

  const selected = options.find((o) => o.value === value);
  const h = compact ? 30 : 34;

  const dropdownStyle: React.CSSProperties = portal && fixedPos ? {
    position: "fixed",
    top: fixedPos.top,
    left: fixedPos.left,
    minWidth: fixedPos.width,
    width: "max-content",
    transform: fixedPos.top < (btnRef.current?.getBoundingClientRect().top ?? 0) ? "translateY(-100%)" : undefined,
  } : {
    position: "absolute",
    ...(dropUp ? { bottom: "calc(100% + 4px)", top: "auto" } : { top: "calc(100% + 4px)", bottom: "auto" }),
    left: 0, minWidth: "100%", width: "max-content",
  };

  const dropList = open && (
    <div style={{
      ...dropdownStyle,
      backgroundColor: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 9999,
      overflow: "hidden", maxHeight: 240, overflowY: "auto",
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
              width: "100%", padding: "7px 12px", border: "none",
              backgroundColor: isActive ? "rgba(59,130,246,0.06)" : "transparent",
              fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
              color: isActive ? "var(--primary)" : "var(--foreground)",
              cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
          >
            <span style={{ flex: 1 }}>{opt.label}</span>
            {isActive && <Check size={12} style={{ color: "var(--primary)", flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
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
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {portal ? dropList : !portal && dropList}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function Pagination({ total, page, pageSize, onPage, onPageSize }: {
  total: number; page: number; pageSize: number;
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
    }}>{children}</button>
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
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Rows per page</span>
        <CustomSelect
          value={String(pageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => { onPageSize(Number(v)); onPage(1); }}
          width={72} compact dropUp
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ minWidth: 30, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>…</span>
          ) : (
            <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
          )
        )}
        <PBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 28, height: 28, borderRadius: 6, border: "none", backgroundColor: bg, color, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >{icon}</button>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 6,
  border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
  color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box",
};
const capStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
  color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em",
};
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };

function DeleteConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Are you sure?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
          <strong>{label}</strong> will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── USERS TAB ────────────────────────────────────────────────────────────────

function UserModal({ user, roles, teams, onClose, onSave }: {
  user: Partial<User>; roles: Role[]; teams: Team[];
  onClose: () => void; onSave: (u: User) => void;
}) {
  const [form, setForm] = useState<Partial<User>>(user);
  const [showPass, setShowPass] = useState(false);
  const set = <K extends keyof User>(k: K, v: User[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !user.id;

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayOpts = DAYS.map((d) => ({ value: d, label: d }));

  const parsedDays = (user.workDays ?? "Mon–Fri").split("–");
  const [dayFrom, setDayFrom] = useState(parsedDays[0] ?? "Mon");
  const [dayTo,   setDayTo]   = useState(parsedDays[1] ?? "Fri");

  const hourOpts = Array.from({ length: 48 }, (_, i) => {
    const hh = String(Math.floor(i / 2)).padStart(2, "0");
    const mm = i % 2 === 0 ? "00" : "30";
    return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
  });

  const roleOpts  = roles.map((r) => ({ value: String(r.id), label: r.name }));
  const teamOpts  = [{ value: "0", label: "No Team" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))];
  const statusOpts = [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }];

  const handleSave = () => onSave({ ...form, workDays: `${dayFrom}–${dayTo}` } as User);

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{isNew ? "Add User" : "Edit User"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, overflowY: "auto" }}>
          {/* Name */}
          <label style={fieldStyle}>
            <span style={capStyle}>Full Name</span>
            <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
          </label>
          {/* Phone */}
          <label style={fieldStyle}>
            <span style={capStyle}>Phone Number</span>
            <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
          </label>

          {/* Working Days — two day pickers */}
          <div style={fieldStyle}>
            <span style={capStyle}>Working Days</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
              <CustomSelect value={dayFrom} options={dayOpts} onChange={setDayFrom} portal />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>–</span>
              <CustomSelect value={dayTo} options={dayOpts} onChange={setDayTo} portal />
            </div>
          </div>

          {/* Working Hours */}
          <div style={fieldStyle}>
            <span style={capStyle}>Working Hours</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
              <CustomSelect value={form.workFrom ?? "08:00"} options={hourOpts} onChange={(v) => set("workFrom", v)} portal />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>–</span>
              <CustomSelect value={form.workTo ?? "17:00"} options={hourOpts} onChange={(v) => set("workTo", v)} portal />
            </div>
          </div>

          {/* Role */}
          <div style={fieldStyle}>
            <span style={capStyle}>Role</span>
            <CustomSelect
              value={String(form.roleId ?? roles[0]?.id ?? "")}
              options={roleOpts}
              onChange={(v) => set("roleId", Number(v))}
              portal
            />
          </div>
          {/* Team */}
          <div style={fieldStyle}>
            <span style={capStyle}>Team</span>
            <CustomSelect
              value={String(form.teamId ?? 0)}
              options={teamOpts}
              onChange={(v) => set("teamId", v === "0" ? null : Number(v))}
              portal
            />
          </div>

          {/* Login */}
          <label style={fieldStyle}>
            <span style={capStyle}>Login</span>
            <input value={form.login ?? ""} onChange={(e) => set("login", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} autoComplete="off" />
          </label>
          {/* Password */}
          <label style={fieldStyle}>
            <span style={capStyle}>Password</span>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={form.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                style={{ ...inputStyle, paddingRight: 36, fontFamily: "var(--font-mono)" }}
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPass((v) => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>

          {/* Status */}
          <div style={fieldStyle}>
            <span style={capStyle}>Status</span>
            <CustomSelect
              value={form.status ?? "Active"}
              options={statusOpts}
              onChange={(v) => set("status", v as UserStatus)}
              portal
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {isNew ? "Create User" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ roles, teams }: { roles: Role[]; teams: Team[] }) {
  const [users, setUsers]     = useState<User[]>(initUsers);
  const [modal, setModal]     = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<User>>({});
  const [deleting, setDeleting] = useState<User | null>(null);
  const [search, setSearch]   = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const save = (u: User) => {
    if (modal === "create") {
      const nextId = Math.max(0, ...users.map((x) => x.id)) + 1;
      setUsers((p) => [...p, { ...u, id: nextId }]);
    } else {
      setUsers((p) => p.map((x) => (x.id === u.id ? u : x)));
    }
    setModal(null);
  };

  const roleOpts = [
    { value: "All", label: "All Roles" },
    ...roles.map((r) => ({ value: String(r.id), label: r.name })),
  ];

  const q = search.toLowerCase();
  const filtered = users.filter((u) => {
    const matchRole = filterRole === "All" || u.roleId === Number(filterRole);
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q) || u.phone.includes(q);
    return matchRole && matchQ;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search users…"
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 30px",
                borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)",
                color: "var(--foreground)", outline: "none", width: 220,
              }}
            />
          </div>
          <CustomSelect
            value={filterRole}
            onChange={(v) => { setFilterRole(v); setPage(1); }}
            options={roleOpts}
            width={160}
          />
        </div>
        <button onClick={() => { setEditing({}); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={180}>Name</TH>
              <TH width={150}>Phone</TH>
              <TH width={100}>Work Days</TH>
              <TH width={120}>Hours</TH>
              <TH width={110}>Role</TH>
              <TH width={130}>Team</TH>
              <TH width={140}>Login</TH>
              <TH width={90}>Status</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {paginated.map((u, i) => {
              const role = roles.find((r) => r.id === u.roleId);
              const team = teams.find((t) => t.id === u.teamId);
              const isEven = i % 2 === 0;
              return (
                <tr key={u.id} style={{ backgroundColor: isEven ? "var(--card)" : "var(--background)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isEven ? "var(--card)" : "var(--background)"; }}
                >
                  <TD mono center>{u.id}</TD>
                  <TD><span style={{ fontWeight: 500 }}>{u.name}</span></TD>
                  <TD mono>{u.phone}</TD>
                  <TD>{u.workDays}</TD>
                  <TD mono>{u.workFrom} – {u.workTo}</TD>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{
                      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                      color: role?.name === "Admin" ? "#1D4ED8" : role?.name === "Dispatcher" ? "#5B21B6" : "#374151",
                      backgroundColor: role?.name === "Admin" ? "#DBEAFE" : role?.name === "Dispatcher" ? "#EDE9FE" : "#F3F4F6",
                      borderRadius: 4, padding: "2px 8px",
                    }}>
                      {role?.name ?? "—"}
                    </span>
                  </td>
                  <TD><span style={{ color: "var(--muted-foreground)" }}>{team?.name ?? "—"}</span></TD>
                  <TD mono>{u.login}</TD>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                      color: u.status === "Active" ? "#065F46" : "#991B1B",
                      backgroundColor: u.status === "Active" ? "#D1FAE5" : "#FEE2E2",
                      borderRadius: 4, padding: "2px 8px",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: u.status === "Active" ? "#10B981" : "#EF4444", display: "inline-block" }} />
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 5 }}>
                      <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => { setEditing(u); setModal("edit"); }} />
                      <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(u)} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  No users match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        total={filtered.length} page={safePage} pageSize={pageSize}
        onPage={setPage} onPageSize={setPageSize}
      />

      {(modal === "create" || modal === "edit") && (
        <UserModal user={editing} roles={roles} teams={teams} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} onClose={() => setDeleting(null)} onConfirm={() => { setUsers((p) => p.filter((x) => x.id !== deleting.id)); setDeleting(null); }} />}
    </>
  );
}

// ─── TEAMS TAB ────────────────────────────────────────────────────────────────

function MultiSelectSearch<T>({
  label,
  selected,
  options,
  getKey,
  getLabel,
  onToggle,
  placeholder,
  chipColor = "#1D4ED8",
  chipBg = "#DBEAFE",
}: {
  label: string;
  selected: T[];
  options: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onToggle: (item: T) => void;
  placeholder?: string;
  chipColor?: string;
  chipBg?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = query.toLowerCase();
  const filtered = options.filter((o) => getLabel(o).toLowerCase().includes(q));
  const selectedKeys = new Set(selected.map(getKey));

  return (
    <div style={fieldStyle}>
      <span style={capStyle}>{label}</span>
      <div ref={containerRef} style={{ position: "relative" }}>
        {/* Input + chips area */}
        <div
          onClick={() => { setOpen(true); inputRef.current?.focus(); }}
          style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
            padding: "6px 8px", minHeight: 38, borderRadius: 7,
            border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
            backgroundColor: "var(--input-background)", cursor: "text",
            boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
        >
          {selected.map((item) => (
            <span key={getKey(item)} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
              color: chipColor, backgroundColor: chipBg,
              borderRadius: 4, padding: "2px 6px 2px 8px",
            }}>
              {getLabel(item)}
              <button
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); onToggle(item); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: chipColor, display: "flex", padding: 0, lineHeight: 1 }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? placeholder : ""}
            style={{
              flex: 1, minWidth: 80, border: "none", outline: "none", background: "transparent",
              fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)",
              padding: "1px 2px",
            }}
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            backgroundColor: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 9999, maxHeight: 200, overflowY: "auto",
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No results</div>
            ) : filtered.map((item) => {
              const isSelected = selectedKeys.has(getKey(item));
              return (
                <button
                  key={getKey(item)}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onToggle(item); setQuery(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 12px", border: "none",
                    backgroundColor: isSelected ? "rgba(59,130,246,0.06)" : "transparent",
                    fontFamily: "var(--font-sans)", fontSize: 13,
                    color: isSelected ? "var(--primary)" : "var(--foreground)",
                    cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  <span style={{ flex: 1 }}>{getLabel(item)}</span>
                  {isSelected && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamModal({ team, users, allDriverNames, onClose, onSave }: {
  team: Partial<Team>; users: User[]; allDriverNames: string[];
  onClose: () => void; onSave: (t: Team) => void;
}) {
  const [form, setForm] = useState<Partial<Team>>(team);
  const isNew = !team.id;

  const selectedUsers = users.filter((u) => (form.userIds ?? []).includes(u.id));
  const selectedDrivers = (form.driverNames ?? []).map((n) => ({ name: n }));

  const driverOptions = Array.from(
    new Set([...allDriverNames, ...(form.driverNames ?? [])])
  ).map((n) => ({ name: n }));

  const toggleUser = (u: User) => {
    setForm((f) => {
      const ids = f.userIds ?? [];
      return { ...f, userIds: ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id] };
    });
  };

  const toggleDriver = (d: { name: string }) => {
    setForm((f) => {
      const names = f.driverNames ?? [];
      return { ...f, driverNames: names.includes(d.name) ? names.filter((x) => x !== d.name) : [...names, d.name] };
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{isNew ? "Create Team" : "Edit Team"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <label style={fieldStyle}>
            <span style={capStyle}>Team Name</span>
            <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </label>

          <MultiSelectSearch
            label="Users"
            selected={selectedUsers}
            options={users}
            getKey={(u) => String(u.id)}
            getLabel={(u) => u.name}
            onToggle={toggleUser}
            placeholder="Search users…"
            chipColor="#1D4ED8"
            chipBg="#DBEAFE"
          />

          <MultiSelectSearch
            label="Drivers"
            selected={selectedDrivers}
            options={driverOptions}
            getKey={(d) => d.name}
            getLabel={(d) => d.name}
            onToggle={toggleDriver}
            placeholder="Search drivers…"
            chipColor="#374151"
            chipBg="var(--muted)"
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(form as Team)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {isNew ? "Create Team" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamsTab({ users }: { users: User[] }) {
  const [teams, setTeams] = useState<Team[]>(initTeams);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<Team>>({});
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const save = (t: Team) => {
    if (modal === "create") {
      const nextId = Math.max(0, ...teams.map((x) => x.id)) + 1;
      setTeams((p) => [...p, { ...t, id: nextId }]);
    } else {
      setTeams((p) => p.map((x) => (x.id === t.id ? t : x)));
    }
    setModal(null);
  };

  const allDriverNames = Array.from(new Set(teams.flatMap((t) => t.driverNames)));

  const q = search.toLowerCase();
  const filtered = teams.filter((t) =>
    !q || t.name.toLowerCase().includes(q) ||
    t.driverNames.some((d) => d.toLowerCase().includes(q)) ||
    users.filter((u) => t.userIds.includes(u.id)).some((u) => u.name.toLowerCase().includes(q))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search teams…"
            style={{
              fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 30px",
              borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)",
              color: "var(--foreground)", outline: "none", width: 220,
            }}
          />
        </div>
        <button onClick={() => { setEditing({ userIds: [], driverNames: [] }); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
          <Plus size={14} /> Create Team
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={180}>Team Name</TH>
              <TH width={340}>Users</TH>
              <TH width={380}>Drivers</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {paginated.map((t, i) => {
              const teamUsers = users.filter((u) => t.userIds.includes(u.id));
              const isEven = i % 2 === 0;
              return (
                <tr key={t.id} style={{ backgroundColor: isEven ? "var(--card)" : "var(--background)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isEven ? "var(--card)" : "var(--background)"; }}
                >
                  <TD mono center>{t.id}</TD>
                  <TD><span style={{ fontWeight: 600 }}>{t.name}</span></TD>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {teamUsers.length === 0
                        ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>No users</span>
                        : teamUsers.map((u) => (
                          <span key={u.id} style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500, color: "#1D4ED8", backgroundColor: "#DBEAFE", borderRadius: 4, padding: "2px 8px" }}>{u.name}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {t.driverNames.length === 0
                        ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>No drivers</span>
                        : t.driverNames.map((d) => (
                          <span key={d} style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#374151", backgroundColor: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px" }}>{d}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 5 }}>
                      <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => { setEditing(t); setModal("edit"); }} />
                      <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(t)} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  No teams match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        total={filtered.length} page={safePage} pageSize={pageSize}
        onPage={setPage} onPageSize={setPageSize}
      />

      {(modal === "create" || modal === "edit") && (
        <TeamModal team={editing} users={users} allDriverNames={allDriverNames} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} onClose={() => setDeleting(null)} onConfirm={() => { setTeams((p) => p.filter((x) => x.id !== deleting.id)); setDeleting(null); }} />}
    </>
  );
}

// ─── ROLES & PERMISSIONS TAB ─────────────────────────────────────────────────

function RoleModal({ role, onClose, onSave }: {
  role: Partial<Role>; onClose: () => void; onSave: (r: Role) => void;
}) {
  const emptyPerms = () => Object.fromEntries(PAGES.map((p) => [p, { create: false, read: false, update: false, delete: false }])) as Permissions;
  const [form, setForm] = useState<Partial<Role>>({ ...role, permissions: role.permissions ? JSON.parse(JSON.stringify(role.permissions)) : emptyPerms() });
  const isNew = !role.id;

  const toggle = (page: PageName, key: CRUDKey) => {
    setForm((f) => {
      const perms = JSON.parse(JSON.stringify(f.permissions)) as Permissions;
      perms[page][key] = !perms[page][key];
      return { ...f, permissions: perms };
    });
  };

  const toggleAll = (page: PageName, val: boolean) => {
    setForm((f) => {
      const perms = JSON.parse(JSON.stringify(f.permissions)) as Permissions;
      CRUD_KEYS.forEach((k) => { perms[page][k] = val; });
      return { ...f, permissions: perms };
    });
  };

  const CRUD_COLORS: Record<CRUDKey, { on: string; bg: string }> = {
    create: { on: "#10B981", bg: "#D1FAE5" },
    read:   { on: "#3B82F6", bg: "#DBEAFE" },
    update: { on: "#F59E0B", bg: "#FEF3C7" },
    delete: { on: "#EF4444", bg: "#FEE2E2" },
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 700, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{isNew ? "Create Role" : `Edit Role: ${role.name}`}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <label style={fieldStyle}>
            <span style={capStyle}>Role Name</span>
            <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, maxWidth: 280 }} />
          </label>

          {/* RBAC matrix */}
          <div>
            <div style={{ ...capStyle, marginBottom: 10, display: "block" }}>Page Permissions</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 60px repeat(4, 1fr)", backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ padding: "8px 14px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Page</div>
                <div style={{ padding: "8px 6px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", textAlign: "center" }}>All</div>
                {CRUD_KEYS.map((k) => (
                  <div key={k} style={{ padding: "8px 6px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", color: CRUD_COLORS[k].on }}>{k}</div>
                ))}
              </div>
              {/* Rows */}
              {PAGES.map((page, pi) => {
                const perms = form.permissions![page];
                const allOn = CRUD_KEYS.every((k) => perms[k]);
                return (
                  <div
                    key={page}
                    style={{ display: "grid", gridTemplateColumns: "160px 60px repeat(4, 1fr)", borderBottom: pi < PAGES.length - 1 ? "1px solid var(--border)" : "none", backgroundColor: pi % 2 === 0 ? "var(--card)" : "var(--background)" }}
                  >
                    <div style={{ padding: "10px 14px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", display: "flex", alignItems: "center" }}>{page}</div>
                    {/* All toggle */}
                    <div style={{ padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <button onClick={() => toggleAll(page, !allOn)} style={{ background: "none", border: "none", cursor: "pointer", color: allOn ? "#3B82F6" : "var(--muted-foreground)", display: "flex" }}>
                        {allOn ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>
                    {CRUD_KEYS.map((k) => {
                      const on = perms[k];
                      return (
                        <div key={k} style={{ padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <button
                            onClick={() => toggle(page, k)}
                            style={{
                              width: 22, height: 22, borderRadius: 4, border: "none", cursor: "pointer",
                              backgroundColor: on ? CRUD_COLORS[k].bg : "var(--muted)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.1s",
                            }}
                          >
                            {on && <Check size={13} style={{ color: CRUD_COLORS[k].on }} strokeWidth={2.5} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(form as Role)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {isNew ? "Create Role" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CRUD_COLORS_INLINE: Record<CRUDKey, { on: string; bg: string; label: string }> = {
  create: { on: "#10B981", bg: "#D1FAE5", label: "C" },
  read:   { on: "#3B82F6", bg: "#DBEAFE", label: "R" },
  update: { on: "#F59E0B", bg: "#FEF3C7", label: "U" },
  delete: { on: "#EF4444", bg: "#FEE2E2", label: "D" },
};

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>(initRoles);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Partial<Role>>({});
  const [deleting, setDeleting] = useState<Role | null>(null);

  const save = (r: Role) => {
    if (modal === "create") {
      const nextId = Math.max(0, ...roles.map((x) => x.id)) + 1;
      setRoles((p) => [...p, { ...r, id: nextId }]);
    } else {
      setRoles((p) => p.map((x) => (x.id === r.id ? r : x)));
    }
    setModal(null);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{roles.length}</span> roles defined
        </span>
        <button onClick={() => { setEditing({}); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
          <Plus size={14} /> Create Role
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={150}>Role Name</TH>
              {PAGES.map((p) => <TH key={p} width={140}>{p}</TH>)}
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => {
              const isEven = i % 2 === 0;
              const ROLE_COLOR: Record<string, { color: string; bg: string }> = {
                Admin:      { color: "#1D4ED8", bg: "#DBEAFE" },
                Dispatcher: { color: "#5B21B6", bg: "#EDE9FE" },
              };
              const rc = ROLE_COLOR[r.name] ?? { color: "#374151", bg: "#F3F4F6" };
              return (
                <tr key={r.id} style={{ backgroundColor: isEven ? "var(--card)" : "var(--background)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isEven ? "var(--card)" : "var(--background)"; }}
                >
                  <TD mono center>{r.id}</TD>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: rc.color, backgroundColor: rc.bg, borderRadius: 4, padding: "3px 10px" }}>{r.name}</span>
                  </td>
                  {PAGES.map((page) => {
                    const perms = r.permissions[page];
                    return (
                      <td key={page} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {CRUD_KEYS.map((k) => {
                            const on = perms[k];
                            const cc = CRUD_COLORS_INLINE[k];
                            return (
                              <span key={k} style={{
                                width: 20, height: 20, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
                                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                                backgroundColor: on ? cc.bg : "var(--muted)",
                                color: on ? cc.on : "var(--border)",
                                border: on ? `1px solid ${cc.on}40` : "1px solid var(--border)",
                              }}>
                                {cc.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 5 }}>
                      <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => { setEditing(r); setModal("edit"); }} />
                      <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(r)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(modal === "create" || modal === "edit") && (
        <RoleModal role={editing} onClose={() => setModal(null)} onSave={save} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} onClose={() => setDeleting(null)} onConfirm={() => { setRoles((p) => p.filter((x) => x.id !== deleting.id)); setDeleting(null); }} />}
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

type TabId = "users" | "teams" | "roles";

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("users");
  const [users] = useState<User[]>(initUsers);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
    { id: "users",  label: "Users",              icon: <Users      size={15} />, color: "#1D4ED8", bg: "#DBEAFE" },
    { id: "teams",  label: "Teams",              icon: <UsersRound size={15} />, color: "#5B21B6", bg: "#EDE9FE" },
    { id: "roles",  label: "Roles & Permissions",icon: <ShieldCheck size={15} />, color: "#065F46", bg: "#D1FAE5" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      {/* Tab bar */}
      <div style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 20px", flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 18px",
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? t.color : "var(--muted-foreground)",
              backgroundColor: "transparent", border: "none",
              borderBottom: active ? `2px solid ${t.color}` : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s", marginBottom: -1,
            }}>
              <span style={{ opacity: active ? 1 : 0.55 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          {tab === "users" && <UsersTab roles={initRoles} teams={initTeams} />}
          {tab === "teams" && <TeamsTab users={users} />}
          {tab === "roles" && <RolesTab />}
        </div>
      </div>
    </div>
  );
}

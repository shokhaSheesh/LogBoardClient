import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Users, UsersRound, ShieldCheck, Plus, Pencil, Trash2, X, Check,
  Eye, EyeOff, ToggleLeft, ToggleRight, Search, ChevronDown, ChevronLeft, ChevronRight, CalendarDays,
  Truck, AlertCircle, Unlink, Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { eldErrorMessage } from "./EldModal";
import { PageLoader } from "./PageLoader";
import { FormError, formErrorInModal, friendlyError, notify } from "./feedback";

// ─── Week settings helpers ────────────────────────────────────────────────────

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

import { api, getCompanyId, isForbidden, ApiError } from "../lib/api";
import { driverDisplayName } from "../lib/driverName";
import { Dash } from "./Dash";
import { fmtDate, fmtDateTime } from "../lib/dates";
import { DatePicker } from "./DatePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

// The stored vocabulary is closed to Active | Suspended. A write may send "Inactive",
// but the backend normalizes it to Suspended and returns/filters on Suspended.
type UserStatus = "Active" | "Suspended";

type Permissions = Record<string, Record<string, boolean>>;

interface Role {
  id: string;
  name: string;
  permissions: Permissions;
  // The seeded Owner role. The backend refuses any edit or delete of it on this screen.
  system: boolean;
  // The seeded Dispatcher / Updater roles: permissions are editable, but the name and the
  // role itself are fixed — the dispatcher pickers find people by these roles' ids.
  builtin: boolean;
}

interface Team {
  id: string;
  name: string;
  userIds: string[];
  driverNames: string[];
}

interface User {
  id: string;
  name: string;
  roleName: string;
  phone: string;
  workDays: string;
  workFrom: string;
  workTo: string;
  roleId: string;
  teamId: string | null;
  login: string;
  password: string;
  status: UserStatus;
}

// ─── Backend types + mappers ──────────────────────────────────────────────────

interface BackendUser {
  id: string;
  full_name?: string;
  email?: string;
  login?: string;
  phone?: string;
  role_id?: string;
  role?: string;
  status?: string;
  work_days?: string;
  work_from?: string;
  work_to?: string;
}

interface BackendRole {
  id: string;
  name: string;
  system?: boolean;
  builtin?: boolean;
  permissions?: string[] | Record<string, Record<string, boolean>>;
}

interface BackendTeam {
  id: string;
  name: string;
  user_ids?: string[];
  driver_names?: string[];
}

function toTeam(b: BackendTeam): Team {
  return {
    id:          b.id,
    name:        b.name,
    userIds:     b.user_ids     ?? [],
    driverNames: b.driver_names ?? [],
  };
}

function fromTeam(t: Partial<Team>): Record<string, unknown> {
  return {
    name:         t.name,
    user_ids:     t.userIds     ?? [],
    driver_names: t.driverNames ?? [],
  };
}

function parseCatalog(perms: string[]): { page: string; actions: string[] }[] {
  const map = new Map<string, string[]>();
  for (const p of perms) {
    if (typeof p !== "string") continue;
    const dot = p.lastIndexOf(".");
    if (dot === -1) continue;
    const page = p.slice(0, dot);
    const action = p.slice(dot + 1);
    if (!map.has(page)) map.set(page, []);
    map.get(page)!.push(action);
  }
  return [...map.entries()].map(([page, actions]) => ({ page, actions }));
}

function normalizeCatalog(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    // string[] — ideal case
    const strings = raw.filter((x) => typeof x === "string") as string[];
    if (strings.length > 0) return strings;
    // array of objects: { key, actions[] } or { name } or { resource, action }
    return raw.flatMap((x: any) => {
      if (typeof x !== "object" || x === null) return [];
      if (typeof x.key === "string" && Array.isArray(x.actions))
        return (x.actions as string[]).map((a: string) => `${x.key}.${a}`);
      if (typeof x.name === "string") return [x.name];
      if (typeof x.resource === "string" && typeof x.action === "string")
        return [`${x.resource}.${x.action}`];
      return [];
    });
  }
  if (typeof raw === "object") {
    // { "board": ["read","create"], "gross": ["read"] }
    return Object.entries(raw as Record<string, unknown>).flatMap(([page, actions]) =>
      Array.isArray(actions) ? (actions as string[]).map((a: string) => `${page}.${a}`) : []
    );
  }
  return [];
}

function toUser(b: BackendUser): User {
  return {
    id:       b.id,
    name:     b.full_name ?? "",
    phone:    b.phone     ?? "",
    workDays: b.work_days ?? "Mon–Fri",
    workFrom: b.work_from ?? "08:00",
    workTo:   b.work_to   ?? "17:00",
    roleId:   b.role_id   ?? "",
    roleName: b.role      ?? "",
    teamId:   null,
    login:    b.email ?? b.login ?? "",
    password: "",
    status:   (b.status === "active" || b.status === "Active") ? "Active" : "Suspended",
  };
}

function fromUser(u: Partial<User>, isNew: boolean, roles: Role[]): Record<string, unknown> {
  // Prefer a selected company role; fall back to the coarse marker the backend gave
  // us (e.g. "updater") so editing a user without a role_id doesn't blank their role.
  const matched  = roles.find((r) => r.id === u.roleId);
  const roleName = (matched?.name ?? u.roleName ?? "").toLowerCase();
  const body: Record<string, unknown> = {
    full_name: u.name,
    phone:     u.phone,
    email:     u.login,
    // Writes take the lowercase pair active | inactive (anything else is a 400); the
    // backend stores and returns it as Active | Suspended.
    status:    u.status === "Suspended" ? "inactive" : "active",
    work_days: u.workDays,
    work_from: u.workFrom,
    work_to:   u.workTo,
  };
  // `role` is only the coarse dispatcher/updater marker — any other value is a 400, so a
  // custom-named company role sends none. role_id is what actually decides permissions.
  if (roleName === "dispatcher" || roleName === "updater") body.role = roleName;
  if (matched) body.role_id = matched.id; // fine-grained company role when one is chosen
  // Required on create; on edit it's sent only when typed, which resets the password.
  if (u.password) body.password = u.password;
  return body;
}

function toRole(b: BackendRole): Role {
  const perms: Permissions = {};
  if (Array.isArray(b.permissions)) {
    for (const perm of b.permissions) {
      const dot = perm.lastIndexOf(".");
      if (dot === -1) continue;
      const page = perm.slice(0, dot);
      const action = perm.slice(dot + 1);
      if (!perms[page]) perms[page] = {};
      perms[page][action] = true;
    }
  } else if (b.permissions && typeof b.permissions === "object") {
    for (const [page, actions] of Object.entries(b.permissions as Record<string, Record<string, boolean>>)) {
      perms[page] = {
        read:   !!(actions.read || actions.view),
        create: !!actions.create,
        update: !!(actions.update || actions.edit),
        delete: !!actions.delete,
      };
    }
  }
  // `builtin` is sent by the backend; until a backend that sends it is deployed, derive it
  // the same way the backend does — the seeded roles have fixed ids ("<companyId>:dispatcher").
  const builtin = b.builtin ?? /:(dispatcher|updater)$/.test(b.id);
  return { id: b.id, name: b.name, permissions: perms, system: !!b.system, builtin };
}

function fromRole(r: Partial<Role>): Record<string, unknown> {
  const permissions: string[] = [];
  if (r.permissions) {
    for (const [page, actions] of Object.entries(r.permissions)) {
      for (const [action, enabled] of Object.entries(actions)) {
        if (enabled) permissions.push(`${page.toLowerCase()}.${action}`);
      }
    }
  }
  return { name: r.name, permissions };
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const TH = ({ children, width, align = "left", style: extraStyle }: { children: React.ReactNode; width?: number; align?: string; style?: React.CSSProperties }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center",
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--card)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
    ...extraStyle,
  }}>{children}</th>
);

const TD = ({ children, mono = false, center = false, style: extra }: { children: React.ReactNode; mono?: boolean; center?: boolean; style?: React.CSSProperties }) => (
  <td style={{
    padding: "8px 14px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: mono ? 12 : 13, color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle", textAlign: center ? "center" : "left",
    ...extra,
  }}>{children}</td>
);

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, portal = false, clearable = false,
}: {
  value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; width?: number | string;
  compact?: boolean; dropUp?: boolean;
  portal?: boolean; // escape overflow:hidden containers (use inside modals)
  clearable?: boolean; // show an × to reset back to "" when a value is selected
}) {
  const [open, setOpen] = useState(false);
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The option the arrow keys are on (-1 = none yet).
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Keep the keyboard-highlighted option in view.
  useEffect(() => {
    if (open && activeIdx >= 0) (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx]);

  const openList = () => {
    if (portal && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const goUp = spaceBelow < 200 && r.top > 200;
      setFixedPos({ top: goUp ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width });
    }
    setActiveIdx(options.findIndex((o) => o.value === value));
    setOpen(true);
  };

  const handleToggle = () => { if (open) setOpen(false); else openList(); };

  const pick = (v: string) => { onChange(v); setOpen(false); btnRef.current?.focus(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openList(); }
      return;
    }
    // Handled here, so an open list inside a dialog closes itself, not the dialog.
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (options.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActiveIdx(0); }
    else if (e.key === "End") { e.preventDefault(); setActiveIdx(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (activeIdx >= 0) pick(options[activeIdx].value);
    }
  };

  const selected = options.find((o) => o.value === value);
  const h = compact ? 30 : 36;

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
    <div ref={listRef} role="listbox" style={{
      ...dropdownStyle,
      backgroundColor: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 9999,
      overflow: "hidden", maxHeight: 240, overflowY: "auto",
    }}>
      {options.map((opt, idx) => {
        const isActive = opt.value === value;
        const isKeyed = idx === activeIdx;
        return (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
            onClick={() => pick(opt.value)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "7px 12px", border: "none",
              backgroundColor: isActive ? "var(--primary-tint)" : isKeyed ? "var(--muted)" : "transparent",
              fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
              color: isActive ? "var(--primary)" : "var(--foreground)",
              cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={() => setActiveIdx(idx)}
          >
            <span style={{ flex: 1 }}>{opt.label}</span>
            {isActive && <Check size={12} style={{ color: "var(--primary)", flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={ref} onKeyDown={onKeyDown} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={handleToggle}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: "var(--card)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s", outline: "none",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        {/* Room for the clear button, which sits on top as a sibling (a button can't nest in a button). */}
        {clearable && value && <span style={{ width: 13, flexShrink: 0 }} />}
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear"
          title="Clear"
          onClick={() => { onChange(""); setOpen(false); }}
          style={{ position: "absolute", right: 29, top: "50%", transform: "translateY(-50%)", display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; }}
        >
          <X size={13} />
        </button>
      )}
      {dropList}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function PBtn({ children, active = false, disabled = false, onClick, label }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} aria-current={active ? "page" : undefined} style={{
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
}

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
        <PBtn label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ minWidth: 30, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>…</span>
          ) : (
            <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
          )
        )}
        <PBtn label="Next page" disabled={page === totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// Row actions stay quiet (grey) until hovered or focused, then take their meaning's colour.
// An icon-only button says nothing to a screen reader (or on hover) without a label.
function ActionBtn({ icon, tone, onClick, label }: { icon: React.ReactNode; tone: "edit" | "delete"; onClick: () => void; label: string }) {
  const hot = tone === "delete"
    ? { color: "#EF4444", bg: "rgba(239,68,68,0.12)" }
    : { color: "var(--primary)", bg: "var(--primary-soft)" };
  const on  = (e: React.SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.color = hot.color; e.currentTarget.style.backgroundColor = hot.bg; };
  const off = (e: React.SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.backgroundColor = "transparent"; };
  return (
    <button onClick={onClick} aria-label={label} title={label}
      style={{ width: 30, height: 30, borderRadius: 7, border: "none", backgroundColor: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s, background-color 0.12s" }}
      onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}
    >{icon}</button>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 8, height: 36,
  border: "1px solid var(--border)", backgroundColor: "var(--card)",
  color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box",
};
// Field label: plain sentence-case text above its control.
const capStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)",
};
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// The backdrop every Settings dialog sits in. It announces itself as a modal dialog,
// keeps Tab inside it, closes on Escape or a click outside, and hands focus back to
// whatever opened it. `busy` blocks closing while a save or delete is in flight.
function ModalShell({ label, onClose, busy = false, children }: { label: string; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Start on the first field, not the header's close button.
    const first = ref.current?.querySelector<HTMLElement>("input, textarea") ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { if (!busy) onClose(); return; }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} onKeyDown={onKeyDown}
      // A press that starts on the backdrop itself (not a drag out of a field) closes it.
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}

// Message shown under a field that failed validation.
function FieldHint({ text }: { text?: string | null }) {
  if (!text) return null;
  return <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>{text}</span>;
}

function DeleteConfirm({ label, onClose, onConfirm, busy = false, error }: { label: string; onClose: () => void; onConfirm: () => void; busy?: boolean; error?: string | null }) {
  return (
    <ModalShell label="Confirm delete" onClose={onClose} busy={busy}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.14)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Are you sure?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: error ? 12 : 20 }}>
          <strong>{label}</strong> will be permanently removed.
        </div>
        <FormError message={error} style={{ marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} disabled={busy} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 96, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 8, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.8 : 1 }}>
            {busy ? <><span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> Deleting…</> : "Delete"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// A failed list load must not read as an empty list — say so and offer a retry.
function LoadErrorRow({ colSpan, message, onRetry }: { colSpan: number; message: string; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "32px 24px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>
          <AlertCircle size={15} /> {message}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onRetry} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </td>
    </tr>
  );
}

const loadErrText = (e: unknown, what: string) => friendlyError(e, `Couldn't load ${what}.`);

// ─── USERS TAB ────────────────────────────────────────────────────────────────

// A person's pay per load (dispatcher KPI): the percent of each completed load's rate they
// earn, as a history of "from this day on, this percent". 0% = not paid from that day.
interface KpiRate { percent: number; active_from: string }
interface KpiRates { current: KpiRate | null; history: KpiRate[]; today: string }
// What the user form asks the page to save after the user itself: a new percent from a day.
interface KpiChange { percent: number; activeFrom: string }

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function UserModal({ user, roles, teams, saving, error, onClose, onSave }: {
  user: Partial<User>; roles: Role[]; teams: Team[];
  saving?: boolean; error?: string | null; onClose: () => void; onSave: (u: User, kpi: KpiChange | null) => void;
}) {
  const [form, setForm] = useState<Partial<User>>(user);
  const [showPass, setShowPass] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof User>(k: K, v: User[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !user.id;

  const req = (label: string) => (
    <span style={capStyle}>{label} <span style={{ color: "#EF4444" }}>*</span></span>
  );
  const errBorder = (val: string | undefined) =>
    submitted && !val?.trim() ? "1px solid #EF4444" : undefined;
  const RED = "1px solid #EF4444";

  // The backend signs users in by email and wants at least 8 characters of password —
  // say so here, next to the field, instead of bouncing the save off the server.
  const loginErr = !form.login?.trim() ? "Login is required."
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.login.trim()) ? "Enter an email address, e.g. name@company.com."
    : null;
  const pass = form.password ?? "";
  const passErr = isNew && !pass.trim() ? "Password is required."
    : pass && pass.length < 8 ? "Use at least 8 characters."
    : null;

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

  // Someone who may manage users but can't read the company's roles gets an empty roles
  // list. They can still assign the two built-in roles, which the backend accepts by name.
  const coarseRoles = roles.length === 0;
  const roleOpts  = coarseRoles
    ? [{ value: "dispatcher", label: "Dispatcher" }, { value: "updater", label: "Updater" }]
    : roles.map((r) => ({ value: r.id, label: r.name }));
  const teamOpts  = teams.map((t) => ({ value: t.id, label: t.name }));
  const statusOpts = [{ value: "Active", label: "Active" }, { value: "Suspended", label: "Suspended" }];

  // The backend may return a coarse role marker (e.g. "updater") with no role_id, so
  // resolve the selected role by id first, then by the role's name — otherwise editing
  // such a user leaves roleId empty and the save is silently blocked.
  const matchedRole = roles.find((r) => r.id === form.roleId) ?? roles.find((r) => r.name.toLowerCase() === (form.roleName ?? "").toLowerCase());
  const effectiveRoleId = matchedRole?.id ?? "";

  // ── Pay per load (dispatcher KPI) ─────────────────────────────────────────
  // Only an owner or a dispatcher can be named on a load, so only they can be paid on one.
  const payable = /:(owner|dispatcher)$/.test(effectiveRoleId) || ["owner", "dispatcher"].includes((matchedRole?.name ?? form.roleName ?? "").toLowerCase());
  const [rates, setRates]   = useState<KpiRates | null>(null);
  const [paid, setPaid]     = useState(false);
  const [percent, setPercent] = useState("");
  const [activeFrom, setActiveFrom] = useState(todayIso());
  const today = rates?.today ?? todayIso();
  // The entry that will be in force once everything on file has started: the last one.
  const latest = rates?.history.length ? rates.history[rates.history.length - 1] : null;
  const wasPaid = !!latest && latest.percent > 0;

  useEffect(() => {
    if (!user.id) return;
    let gone = false;
    api.get<KpiRates>(`/kpi/rates?user_id=${user.id}`)
      .then((r) => {
        if (gone || !r) return;
        setRates(r);
        const last = r.history.length ? r.history[r.history.length - 1] : null;
        setPaid(!!last && last.percent > 0);
        if (last && last.percent > 0) setPercent(String(last.percent));
        setActiveFrom(r.today);
      })
      // Not being able to read it (no permission, older server) just leaves the section as "not paid".
      .catch(() => {});
    return () => { gone = true; };
  }, [user.id]);

  const pct = Number(percent);
  const percentErr = !paid ? null
    : percent.trim() === "" ? "Enter the percent."
    : !Number.isFinite(pct) || pct <= 0 || pct > 100 ? "Enter a percent above 0, up to 100."
    : null;
  const dateErr = paid && activeFrom < today ? "Pick today or a later day." : null;

  // What, if anything, changed about the pay: a new percent from a day, or 0% from today
  // to stop it. Nothing when it reads the same as what's already on file.
  const kpiChange = (): KpiChange | null => {
    if (!payable) return null;
    if (!paid) return wasPaid ? { percent: 0, activeFrom: today } : null;
    if (wasPaid && latest!.percent === pct && latest!.active_from >= activeFrom) return null;
    return { percent: pct, activeFrom };
  };

  const handleSave = () => {
    setSubmitted(true);
    // A role is present if we resolved a company role OR carry a coarse role marker.
    const hasRole = !!effectiveRoleId || !!form.roleName?.trim();
    const missing = !form.name?.trim() || !hasRole || !!loginErr || !!passErr || (payable && (!!percentErr || !!dateErr));
    if (missing) return;
    onSave({
      ...form,
      roleId:   effectiveRoleId,
      workDays: `${dayFrom}–${dayTo}`,
      workFrom: form.workFrom ?? "08:00",
      workTo:   form.workTo ?? "17:00",
    } as User, kpiChange());
  };

  return (
    <ModalShell label={isNew ? "Add user" : "Edit user"} onClose={onClose} busy={!!saving}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 800, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{isNew ? "Add user" : "Edit user"}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 14px", overflowY: "auto" }}>
          {/* Name */}
          <label style={fieldStyle}>
            {req("Full name")}
            <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} style={{ ...inputStyle, border: errBorder(form.name) ?? inputStyle.border }} />
            <FieldHint text={submitted && !form.name?.trim() ? "Full name is required." : null} />
          </label>
          {/* Phone */}
          <label style={fieldStyle}>
            <span style={capStyle}>Phone number</span>
            <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
          </label>

          {/* Working Days — two day pickers */}
          <div style={fieldStyle}>
            <span style={capStyle}>Working days</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
              <CustomSelect value={dayFrom} options={dayOpts} onChange={setDayFrom} portal />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>–</span>
              <CustomSelect value={dayTo} options={dayOpts} onChange={setDayTo} portal />
            </div>
          </div>

          {/* Working Hours */}
          <div style={fieldStyle}>
            <span style={capStyle}>Working hours</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
              <CustomSelect value={form.workFrom ?? "08:00"} options={hourOpts} onChange={(v) => set("workFrom", v)} portal />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>–</span>
              <CustomSelect value={form.workTo ?? "17:00"} options={hourOpts} onChange={(v) => set("workTo", v)} portal />
            </div>
          </div>

          {/* Role */}
          <div style={fieldStyle}>
            {req("Role")}
            <CustomSelect
              value={coarseRoles ? (form.roleName ?? "").toLowerCase() : effectiveRoleId}
              options={roleOpts}
              // Clearing must drop the coarse roleName fallback too — otherwise
              // effectiveRoleId re-resolves from it and the clear has no effect.
              onChange={(v) => setForm((f) => coarseRoles
                ? { ...f, roleId: "", roleName: v }
                : { ...f, roleId: v, roleName: v ? f.roleName : "" })}
              portal
              clearable
            />
            <FieldHint text={submitted && !effectiveRoleId && !form.roleName?.trim() ? "Choose a role." : null} />
          </div>
          {/* Team */}
          <div style={fieldStyle}>
            <span style={capStyle}>Team</span>
            <CustomSelect
              value={form.teamId ?? ""}
              options={teamOpts}
              onChange={(v) => set("teamId", v === "" ? null : v)}
              portal
              clearable
            />
          </div>

          {/* Login */}
          <label style={fieldStyle}>
            {req("Login")}
            <input value={form.login ?? ""} onChange={(e) => set("login", e.target.value)} placeholder="name@company.com" style={{ ...inputStyle, fontFamily: "var(--font-mono)", border: submitted && loginErr ? RED : inputStyle.border }} autoComplete="off" type="text" />
            <FieldHint text={submitted ? loginErr : null} />
          </label>
          {/* Password */}
          <label style={fieldStyle}>
            {isNew ? req("Password") : <span style={capStyle}>Password</span>}
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={form.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder={isNew ? undefined : "Leave blank to keep the current one"}
                style={{ ...inputStyle, paddingRight: 36, fontFamily: "var(--font-mono)", border: submitted && passErr ? RED : inputStyle.border }}
                autoComplete="new-password"
              />
              <button type="button" aria-label={showPass ? "Hide password" : "Show password"} onClick={() => setShowPass((v) => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <FieldHint text={submitted ? passErr : null} />
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

          {/* Pay per load — owners and dispatchers only */}
          {payable && (
            <div style={{ gridColumn: "1 / -1", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Paid per load</div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
                    A percent of the rate of each load they dispatched, once it's completed.
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={paid} aria-label="Paid per load" onClick={() => setPaid((v) => !v)}
                  style={{ width: 38, height: 22, borderRadius: 11, border: "none", padding: 2, cursor: "pointer", flexShrink: 0, backgroundColor: paid ? "var(--primary)" : "var(--switch-background)", transition: "background-color 0.15s" }}>
                  <span style={{ display: "block", width: 18, height: 18, borderRadius: "50%", backgroundColor: "#fff", transform: paid ? "translateX(16px)" : "none", transition: "transform 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
                </button>
              </div>

              {paid && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 14px" }}>
                  <label style={fieldStyle}>
                    <span style={capStyle}>Percent of the load's rate <span style={{ color: "#EF4444" }}>*</span></span>
                    <div style={{ position: "relative" }}>
                      <input value={percent} inputMode="decimal" placeholder="e.g. 1.5" autoComplete="off"
                        onChange={(e) => setPercent(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 6))}
                        style={{ ...inputStyle, paddingRight: 30, fontFamily: "var(--font-mono)", border: submitted && percentErr ? RED : inputStyle.border }} />
                      <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>%</span>
                    </div>
                    <FieldHint text={submitted ? percentErr : null} />
                  </label>
                  <div style={fieldStyle}>
                    <span style={capStyle}>Active from <span style={{ color: "#EF4444" }}>*</span></span>
                    <DatePicker label="Active from" value={activeFrom} min={today} onChange={setActiveFrom} invalid={submitted && !!dateErr} />
                    <FieldHint text={submitted ? dateErr : null} />
                  </div>
                  {/* What this does, in plain numbers, before it's saved */}
                  <div style={{ ...fieldStyle, justifyContent: "flex-end" }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
                      {percentErr ? "Only today or a later day can be chosen." : <>A $1,000 load pays <strong style={{ color: "var(--foreground)" }}>${(10 * pct).toFixed(2)}</strong>.</>}
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, padding: "9px 11px", borderRadius: 8, backgroundColor: "var(--primary-faint)", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--foreground)", lineHeight: 1.5 }}>
                    <AlertCircle size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Applies to loads <strong>completed from {fmtDate(activeFrom)}</strong>.
                      {wasPaid ? ` Earlier loads keep ${latest!.percent}%.` : " Earlier loads pay nothing."}
                    </span>
                  </div>
                </div>
              )}

              {!paid && wasPaid && (
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#B45309", lineHeight: 1.5 }}>
                  Saving stops the pay from today ({fmtDate(today)}). Loads completed before today keep the {latest!.percent}% they earned.
                </div>
              )}

              {rates && rates.history.length > 0 && (
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px 10px", flexWrap: "wrap", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
                  <span style={{ fontWeight: 600 }}>History</span>
                  {rates.history.map((h) => (
                    <span key={h.active_from} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {h.percent > 0 ? `${h.percent}%` : "Off"} from {fmtDate(h.active_from)}{h.active_from > today ? " (scheduled)" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <FormError message={error} style={formErrorInModal} />

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 8, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {saving ? <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> : <Check size={14} />}
            {saving ? (isNew ? "Creating…" : "Saving…") : (isNew ? "Create User" : "Save Changes")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function UsersTab({ roles, teams, reloadTeams, reloadRoles, canCreate, canUpdate, canDelete }: {
  roles: Role[]; teams: Team[]; reloadTeams: () => Promise<unknown>; reloadRoles: () => Promise<unknown>;
  canCreate: boolean; canUpdate: boolean; canDelete: boolean;
}) {
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [modal, setModal]       = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]   = useState<Partial<User>>({});
  const [deleting, setDeleting] = useState<User | null>(null);
  const [delBusy, setDelBusy]   = useState(false);
  const [delErr, setDelErr]     = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    api.get<any[]>(`/company/users`)
      .then((data) => setUsers((data ?? []).map(toUser)))
      .catch((e) => setLoadErr(loadErrText(e, "users")))
      .finally(() => setLoading(false));
  }, [fetchKey]);

  // The Team and Role columns are derived from the teams and roles lists, which the other
  // tabs can change — re-pull them every time this tab opens rather than trusting a
  // page-load copy.
  useEffect(() => {
    void reloadTeams();
    void reloadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (u: User, kpi: KpiChange | null) => {
    const isNew = modal === "create";
    setSaveErr(null);
    setSaving(true);
    try {
      // 1) Save the user itself. The user body carries no team field — team membership
      //    lives on the team resource (its user_ids), so it's reconciled separately below.
      let userId = u.id;
      if (isNew) {
        const created = await api.post<{ id?: string }>(`/company/users`, fromUser(u, true, roles));
        userId = created?.id ?? "";
      } else {
        await api.put(`/company/users/${u.id}`, fromUser(u, false, roles));
      }

      // 2) Reconcile team membership by editing the affected teams' user_ids.
      //    The user is already saved by now, so a failure here must NOT leave the modal
      //    open on "Create User" — pressing it again would create the user a second time.
      let teamErr: string | null = null;
      const desiredTeamId = u.teamId ?? null;
      const currentTeam   = userId ? teams.find((t) => t.userIds.includes(userId)) ?? null : null;
      if (userId && desiredTeamId !== (currentTeam?.id ?? null)) {
        try {
          // Remove from the old team (if any)…
          if (currentTeam) {
            await api.put(`/company/teams/${currentTeam.id}`,
              fromTeam({ ...currentTeam, userIds: currentTeam.userIds.filter((id) => id !== userId) }));
          }
          // …and add to the new one (if any).
          const target = desiredTeamId ? teams.find((t) => t.id === desiredTeamId) : null;
          if (target && !target.userIds.includes(userId)) {
            await api.put(`/company/teams/${target.id}`,
              fromTeam({ ...target, userIds: [...target.userIds, userId] }));
          }
        } catch (e) {
          teamErr = friendlyError(e, "request failed");
        }
        await reloadTeams();
      }

      // 3) The pay percent, when the form changed it. Same rule as the team: the user is
      //    saved, so a failure here is reported, not retried by reopening "Create".
      let kpiErr: string | null = null;
      if (userId && kpi) {
        try {
          await api.post(`/kpi/rates`, { user_id: userId, percent: kpi.percent, active_from: kpi.activeFrom });
        } catch (e) {
          kpiErr = friendlyError(e, "request failed");
        }
      }

      setFetchKey((k) => k + 1);
      setModal(null);
      const failed = [teamErr && `the team wasn't updated: ${teamErr}`, kpiErr && `the pay percent wasn't saved: ${kpiErr}`].filter(Boolean);
      if (failed.length) notify.error(`User ${isNew ? "created" : "saved"}, but ${failed.join("; and ")}`);
      else notify.success(isNew ? "User created" : "User updated");
    } catch (e) {
      setSaveErr(friendlyError(e, "Save failed")); // keep modal open
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (u: User) => {
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/company/users/${u.id}`);
      setFetchKey((k) => k + 1);
      setDeleting(null);
      notify.success(`${u.name || "User"} removed`);
    } catch (e) {
      setDelErr(friendlyError(e, "Delete failed"));
    } finally {
      setDelBusy(false);
    }
  };

  const roleOpts = [
    { value: "All", label: "All Roles" },
    ...roles.map((r) => ({ value: r.id, label: r.name })),
  ];

  // A user may carry only a role NAME (no role_id) — resolve by id first, then by name, so
  // the filter and the Role column agree on which role a user has.
  const roleOf = (u: User) => roles.find((r) => r.id === u.roleId) ?? roles.find((r) => r.name.toLowerCase() === u.roleName.toLowerCase());

  const q = search.toLowerCase();
  const filtered = users.filter((u) => {
    const matchRole = filterRole === "All" || roleOf(u)?.id === filterRole;
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q) || u.phone.includes(q);
    return matchRole && matchQ;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search users…"
              aria-label="Search users"
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
        {canCreate && (
          <button onClick={() => { setEditing({}); setSaveErr(null); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
            <Plus size={14} /> Add User
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={180}>Name</TH>
              <TH width={150}>Phone</TH>
              <TH width={100}>Work Days</TH>
              <TH width={120}>Hours</TH>
              <TH width={110}>Role</TH>
              <TH width={130}>Team</TH>
              <TH width={140}>Login</TH>
              <TH width={90}>Status</TH>
              <TH width={90} align="center" style={{ right: 0, zIndex: 6, boxShadow: "inset 1px 0 0 var(--border)" }}>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ padding: 0 }}><PageLoader label="users" /></td></tr>
            )}
            {!loading && loadErr && <LoadErrorRow colSpan={9} message={loadErr} onRetry={() => setFetchKey((k) => k + 1)} />}
            {!loading && !loadErr && paginated.map((u, i) => {
              const role = roleOf(u);
              // A user's team is derived from the team that lists them (user body has no team field).
              const team = teams.find((t) => t.userIds.includes(u.id));
              return (
                <tr key={u.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--primary-faint)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ""; }}
                >
                  <TD><span style={{ fontWeight: 500 }}>{u.name}</span></TD>
                  <TD mono>{u.phone}</TD>
                  <TD>{u.workDays}</TD>
                  <TD mono>{u.workFrom} – {u.workTo}</TD>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{
                      fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
                      color: "var(--foreground)", backgroundColor: "var(--muted)",
                      borderRadius: 5, padding: "2px 9px",
                    }}>
                      {role?.name ?? (u.roleName || <Dash />)}
                    </span>
                  </td>
                  <TD><span style={{ color: "var(--muted-foreground)" }}>{team?.name ?? <Dash />}</span></TD>
                  <TD mono>{u.login}</TD>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                      color: u.status === "Active" ? "#10B981" : "#EF4444",
                      backgroundColor: u.status === "Active" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                      borderRadius: 4, padding: "2px 8px",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: u.status === "Active" ? "#10B981" : "#EF4444", display: "inline-block" }} />
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding: "4px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center", position: "sticky", right: 0, backgroundColor: "var(--card)", boxShadow: "inset 1px 0 0 var(--border)" }}>
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      {canUpdate && <ActionBtn label={`Edit ${u.name || "user"}`} icon={<Pencil size={14} />} tone="edit" onClick={() => { setEditing({ ...u, teamId: team?.id ?? null }); setSaveErr(null); setModal("edit"); }} />}
                      {canDelete && <ActionBtn label={`Delete ${u.name || "user"}`} icon={<Trash2 size={14} />} tone="delete" onClick={() => setDeleting(u)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && !loadErr && paginated.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  No users found.
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
        <UserModal user={editing} roles={roles} teams={teams} saving={saving} error={saveErr} onClose={() => { setModal(null); setSaveErr(null); }} onSave={(u, kpi) => { void save(u, kpi); }} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={() => confirmDelete(deleting)} />}
      {saving && <div style={{ position: "fixed", inset: 0, zIndex: 200 }} />}
    </>
  );
}

// ─── TEAMS TAB ────────────────────────────────────────────────────────────────

// Backend-paginated multi-select with infinite scroll and server-side search — the
// multi equivalent of AsyncSearchableSelect. It fetches the option list one page at a
// time (so a 5,000-driver fleet doesn't arrive at once) and re-queries as you type.
// Selection is tracked by key in the parent; `initialLabels` seeds the chip text for
// already-selected keys (the ones an edit opens with, which may not be on page 1), and
// the cache grows as more pages load.
interface AsyncOpt { key: string; label: string; }

function AsyncMultiSelect({
  label, selectedKeys, initialLabels, fetchPage, onToggle, onClear, placeholder,
  chipColor = "var(--primary)", chipBg = "var(--primary-soft)",
}: {
  label: string;
  selectedKeys: string[];
  initialLabels?: Record<string, string>;
  fetchPage: (query: string, page: number) => Promise<{ items: AsyncOpt[]; total: number }>;
  onToggle: (key: string, label: string) => void;
  onClear?: () => void;
  placeholder?: string;
  chipColor?: string;
  chipBg?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<AsyncOpt[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  // key -> label, so a selected chip reads as a name even before its page loads.
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels ?? {});

  const selectedSet = new Set(selectedKeys);
  const labelFor = (k: string) => labels[k] ?? k;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query), 250); return () => clearTimeout(t); }, [query]);

  const loadPage = async (pageNum: number, q: string, replace: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const { items: rows, total: t } = await fetchPage(q, pageNum);
      if (id !== reqId.current) return;
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setTotal(t);
      setPage(pageNum);
      setDenied(false);
      setLabels((prev) => { const next = { ...prev }; for (const r of rows) next[r.key] = r.label; return next; });
    } catch (e) {
      if (id === reqId.current && isForbidden(e)) setDenied(true);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setItems([]); setTotal(0); setPage(1);
    void loadPage(1, debouncedQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48 && items.length < total) {
      void loadPage(page + 1, debouncedQuery, false);
    }
  };

  return (
    <div style={fieldStyle}>
      <span style={capStyle}>{label}</span>
      <div ref={wrapRef} style={{ position: "relative" }}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => { setOpen((v) => !v); setQuery(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", height: 34, paddingLeft: 10, paddingRight: 8,
            fontFamily: "var(--font-sans)", fontSize: 13, backgroundColor: "var(--card)",
            border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`, borderRadius: 7,
            color: selectedKeys.length === 0 ? "var(--muted-foreground)" : "var(--foreground)", cursor: "pointer",
            boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none", outline: "none",
          }}
        >
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedKeys.length === 0 ? (placeholder ?? "Select…")
              : selectedKeys.length === 1 ? labelFor(selectedKeys[0])
              : `${selectedKeys.length} selected`}
          </span>
          {onClear && selectedKeys.length > 0 && <span style={{ width: 13, flexShrink: 0 }} />}
          <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>
        {onClear && selectedKeys.length > 0 && (
          <button type="button" aria-label="Clear all" title="Clear all"
            onClick={() => { onClear(); setOpen(false); }}
            style={{ position: "absolute", right: 29, top: 17, transform: "translateY(-50%)", display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; }}>
            <X size={13} />
          </button>
        )}

        {selectedKeys.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            {selectedKeys.map((k) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: chipColor, backgroundColor: chipBg, borderRadius: 4, padding: "2px 6px 2px 8px" }}>
                {labelFor(k)}
                <button type="button" aria-label={`Remove ${labelFor(k)}`} onClick={() => onToggle(k, labelFor(k))} style={{ background: "none", border: "none", cursor: "pointer", color: chipColor, display: "flex", padding: 0, lineHeight: 1 }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden" }}>
            <div style={{ padding: "8px 8px 4px" }}>
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
                <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${label.toLowerCase()}`}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
                  style={{ width: "100%", height: 30, paddingLeft: 26, paddingRight: 8, fontFamily: "var(--font-sans)", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--card)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div ref={listRef} onScroll={onScroll} style={{ maxHeight: 180, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
              {items.map((item) => {
                const isSelected = selectedSet.has(item.key);
                return (
                  <button key={item.key} type="button"
                    onMouseDown={(e) => { e.preventDefault(); onToggle(item.key, item.label); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", backgroundColor: isSelected ? "var(--primary-tint)" : "transparent", fontFamily: "var(--font-sans)", fontSize: 13, color: isSelected ? "var(--primary)" : "var(--foreground)", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {isSelected && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                  </button>
                );
              })}
              {loading && <div style={{ padding: 10, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Loading…</div>}
              {!loading && items.length === 0 && (
                <div style={{ padding: "10px 12px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  {denied ? "You don't have access to this list." : "No results"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamModal({ team, users, driverLabels, saving, error, onClose, onSave }: {
  team: Partial<Team>; users: User[]; driverLabels: Record<string, string>;
  saving?: boolean; error?: string | null; onClose: () => void; onSave: (t: Team) => void;
}) {
  const [form, setForm] = useState<Partial<Team>>(team);
  const [submitted, setSubmitted] = useState(false);
  const isNew = !team.id;
  const nameMissing = !form.name?.trim();

  const handleSave = () => {
    setSubmitted(true);
    if (nameMissing) return;
    onSave({ ...form, name: form.name!.trim() } as Team);
  };

  // Seed chip labels for members an edit opens with. Users resolve id -> name from the
  // tab's (small) users list; a driver's key IS its name, prettied via driverLabels.
  const userLabelSeed = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const toggleUser = (id: string) => setForm((f) => {
    const ids = f.userIds ?? [];
    return { ...f, userIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
  });

  const toggleDriver = (name: string) => setForm((f) => {
    const names = f.driverNames ?? [];
    return { ...f, driverNames: names.includes(name) ? names.filter((x) => x !== name) : [...names, name] };
  });

  return (
    <ModalShell label={isNew ? "Create team" : "Edit team"} onClose={onClose} busy={!!saving}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{isNew ? "Create team" : "Edit team"}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <label style={fieldStyle}>
            <span style={capStyle}>Team name <span style={{ color: "#EF4444" }}>*</span></span>
            <input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, border: submitted && nameMissing ? "1px solid #EF4444" : inputStyle.border }} />
            <FieldHint text={submitted && nameMissing ? "Team name is required." : null} />
          </label>

          <AsyncMultiSelect
            label="Users"
            selectedKeys={form.userIds ?? []}
            initialLabels={userLabelSeed}
            // /company/users has no ?q=/paging and the tab has already loaded the whole
            // list, so search it in memory — no request per keystroke.
            fetchPage={async (q) => {
              const needle = q.trim().toLowerCase();
              const opts = users
                .map((u) => ({ key: u.id, label: u.name || u.login || u.id }))
                .filter((o) => !needle || o.label.toLowerCase().includes(needle));
              return { items: opts, total: opts.length };
            }}
            onToggle={(id) => toggleUser(id)}
            onClear={() => setForm((f) => ({ ...f, userIds: [] }))}
            placeholder="Select users…"
            chipColor="var(--primary)"
            chipBg="var(--primary-soft)"
          />

          <AsyncMultiSelect
            label="Drivers"
            selectedKeys={form.driverNames ?? []}
            initialLabels={driverLabels}
            fetchPage={async (q, p) => {
              const { items, total } = await api.getList<any>("/drivers", { q: q || undefined, page: p, page_size: 20 });
              // Teams key drivers by NAME (not id), so the raw name is the selection key.
              return { items: (items ?? []).filter((d: any) => d.name).map((d: any) => ({ key: d.name as string, label: driverDisplayName(d) })), total };
            }}
            onToggle={(name) => toggleDriver(name)}
            onClear={() => setForm((f) => ({ ...f, driverNames: [] }))}
            placeholder="Select drivers…"
            chipColor="var(--foreground)"
            chipBg="var(--muted)"
          />
        </div>
        <FormError message={error} style={formErrorInModal} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 8, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Create Team" : "Save Changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function TeamsTab({ canCreate, canUpdate, canDelete }: {
  canCreate: boolean; canUpdate: boolean; canDelete: boolean;
}) {
  const [teams, setTeams]       = useState<Team[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  // name -> display label ("Name 1 & Name 2" for team drivers). The dispatch-pod
  // Teams API resolves members by the raw driver `name`, so that stays the
  // identity key everywhere — this map only affects what's shown on screen (the teams
  // table and the pre-selected chips in the modal). The modal's driver picker itself
  // pages the full fleet on demand, so this preload is display-only.
  const [driverLabels, setDriverLabels] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [modal, setModal]       = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]   = useState<Partial<Team>>({});
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [delBusy, setDelBusy]   = useState(false);
  const [delErr, setDelErr]     = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    // Team chips show a driver's display label, so every driver is needed, not just the
    // first page — walk the list until it's all here (capped so a bad total can't loop).
    const allDrivers = async () => {
      const out: any[] = [];
      for (let p = 1; p <= 50; p++) {
        const { items, total } = await api.getList<any>("/drivers", { page: p, page_size: 200 });
        out.push(...(items ?? []));
        if (!items?.length || out.length >= total) break;
      }
      return out;
    };
    Promise.all([
      api.get<any[]>(`/company/teams`),
      api.get<any[]>(`/company/users`),
      allDrivers(),
    ])
      .then(([teamsData, usersData, driverList]) => {
        setTeams((teamsData ?? []).map(toTeam));
        setUsers((usersData ?? []).map(toUser));
        setDriverLabels(Object.fromEntries(driverList.filter((d) => d.name).map((d) => [d.name, driverDisplayName(d)])));
      })
      .catch((e) => setLoadErr(loadErrText(e, "teams")))
      .finally(() => setLoading(false));
  }, [fetchKey]);

  const save = async (t: Team) => {
    setSaving(true);
    setSaveErr(null);
    try {
      if (modal === "create") {
        await api.post(`/company/teams`, fromTeam(t));
        notify.success("Team created");
      } else {
        await api.put(`/company/teams/${t.id}`, fromTeam(t));
        notify.success("Team updated");
      }
      setFetchKey((k) => k + 1);
      setModal(null);
    } catch (e) {
      setSaveErr(friendlyError(e, "Save failed")); // keep modal open
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (t: Team) => {
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/company/teams/${t.id}`);
      notify.success("Team deleted");
      setFetchKey((k) => k + 1);
      setDeleting(null);
    } catch (e) {
      setDelErr(friendlyError(e, "Delete failed"));
    } finally {
      setDelBusy(false);
    }
  };

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search teams…"
            aria-label="Search teams"
            style={{
              fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 30px",
              borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)",
              color: "var(--foreground)", outline: "none", width: 220,
            }}
          />
        </div>
        {canCreate && (
          <button onClick={() => { setEditing({ userIds: [], driverNames: [] }); setSaveErr(null); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
            <Plus size={14} /> Create Team
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
          <thead>
            <tr>

              <TH width={180}>Team Name</TH>
              <TH width={340}>Users</TH>
              <TH width={380}>Drivers</TH>
              <TH width={90} align="center" style={{ right: 0, zIndex: 6, boxShadow: "inset 1px 0 0 var(--border)" }}>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {!loadErr && paginated.map((t, i) => {
              const teamUsers = users.filter((u) => t.userIds.includes(u.id));
              return (
                <tr key={t.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--primary-faint)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ""; }}
                >

                  <TD><span style={{ fontWeight: 600 }}>{t.name}</span></TD>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {teamUsers.length === 0
                        ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>No users</span>
                        : teamUsers.map((u) => (
                          <span key={u.id} style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--secondary-foreground)", backgroundColor: "var(--primary-soft)", borderRadius: 5, padding: "2px 9px" }}>{u.name}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {t.driverNames.length === 0
                        ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>No drivers</span>
                        : t.driverNames.map((d) => (
                          <span key={d} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", backgroundColor: "var(--muted)", borderRadius: 5, padding: "2px 9px" }}>{driverLabels[d] ?? d}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ padding: "4px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center", position: "sticky", right: 0, backgroundColor: "var(--card)", boxShadow: "inset 1px 0 0 var(--border)" }}>
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      {canUpdate && <ActionBtn label={`Edit ${t.name}`} icon={<Pencil size={14} />} tone="edit" onClick={() => { setEditing(t); setSaveErr(null); setModal("edit"); }} />}
                      {canDelete && <ActionBtn label={`Delete ${t.name}`} icon={<Trash2 size={14} />} tone="delete" onClick={() => setDeleting(t)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {loading && (
              <tr><td colSpan={4} style={{ padding: 0 }}><PageLoader label="teams" /></td></tr>
            )}
            {!loading && loadErr && <LoadErrorRow colSpan={4} message={loadErr} onRetry={() => setFetchKey((k) => k + 1)} />}
            {!loading && !loadErr && paginated.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
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
        <TeamModal team={editing} users={users} driverLabels={driverLabels} saving={saving} error={saveErr} onClose={() => { setModal(null); setSaveErr(null); }} onSave={(t) => { void save(t); }} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={() => { void confirmDelete(deleting); }} />}
    </>
  );
}

// ─── ROLES & PERMISSIONS TAB ─────────────────────────────────────────────────

function RoleModal({ role, entries: catalogEntries, saving, error, onClose, onSave }: {
  role: Partial<Role>; entries: { page: string; actions: string[] }[]; saving?: boolean; error?: string | null; onClose: () => void; onSave: (r: Role) => void;
}) {
  const allActions = [...new Set(catalogEntries.flatMap((e) => e.actions))].sort(
    (a, b) => (ACTION_ORDER.indexOf(a) + 1 || 99) - (ACTION_ORDER.indexOf(b) + 1 || 99)
  );

  const buildEmpty = (): Permissions =>
    Object.fromEntries(catalogEntries.map(({ page, actions }) => [page, Object.fromEntries(actions.map((a) => [a, false]))]));

  const initPerms = (): Permissions => {
    const base = buildEmpty();
    if (role.permissions) {
      // Carry over everything the role already holds — including keys the catalog has no
      // checkbox for — so saving the form can never silently strip a permission.
      for (const [page, actions] of Object.entries(role.permissions)) {
        if (!base[page]) base[page] = {};
        for (const [action, val] of Object.entries(actions)) {
          base[page][action] = val as boolean;
        }
      }
    }
    return base;
  };

  const [form, setForm] = useState<Partial<Role>>({ ...role, permissions: initPerms() });
  const [submitted, setSubmitted] = useState(false);
  const isNew = !role.id;
  const nameMissing = !form.name?.trim();

  const handleSave = () => {
    setSubmitted(true);
    if (nameMissing) return;
    onSave({ ...form, name: form.name!.trim() } as Role);
  };

  const toggle = (page: string, action: string) => {
    setForm((f) => {
      const perms = JSON.parse(JSON.stringify(f.permissions)) as Permissions;
      if (!perms[page]) perms[page] = {};
      perms[page][action] = !perms[page][action];
      return { ...f, permissions: perms };
    });
  };

  const toggleAll = (page: string, val: boolean, actions: string[]) => {
    setForm((f) => {
      const perms = JSON.parse(JSON.stringify(f.permissions)) as Permissions;
      if (!perms[page]) perms[page] = {};
      actions.forEach((a) => { perms[page][a] = val; });
      return { ...f, permissions: perms };
    });
  };

  return (
    <ModalShell label={isNew ? "Create role" : "Edit role"} onClose={onClose} busy={!!saving}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 700, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{isNew ? "Create role" : `Edit role: ${role.name}`}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <label style={fieldStyle}>
            <span style={capStyle}>Role name {!role.builtin && <span style={{ color: "#EF4444" }}>*</span>}</span>
            <input value={form.name ?? ""} disabled={role.builtin} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, maxWidth: 280, border: submitted && nameMissing ? "1px solid #EF4444" : inputStyle.border, ...(role.builtin ? { opacity: 0.6, cursor: "not-allowed" } : {}) }} />
            {role.builtin && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>
                Built-in role — its name can't be changed. You can still change what it's allowed to do.
              </span>
            )}
            <FieldHint text={submitted && nameMissing ? "Role name is required." : null} />
          </label>

          {/* RBAC matrix */}
          <div>
            <div style={{ ...capStyle, marginBottom: 10, display: "block" }}>Page permissions</div>
            {catalogEntries.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading permissions…</div>
            ) : (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: `160px 60px repeat(${allActions.length}, 1fr)`, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ padding: "8px 14px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Page</div>
                  <div style={{ padding: "8px 6px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", textAlign: "center" }}>All</div>
                  {allActions.map((a) => (
                    <div key={a} style={{ padding: "8px 6px", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", color: "var(--muted-foreground)" }}>{a}</div>
                  ))}
                </div>
                {/* Rows */}
                {catalogEntries.map(({ page, actions }, pi) => {
                  const perms = form.permissions?.[page] ?? {};
                  const allOn = actions.every((a) => perms[a]);
                  return (
                    <div key={page} style={{ display: "grid", gridTemplateColumns: `160px 60px repeat(${allActions.length}, 1fr)`, borderBottom: pi < catalogEntries.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <div style={{ padding: "10px 14px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", display: "flex", alignItems: "center", textTransform: "capitalize" }}>{page}</div>
                      <div style={{ padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <button aria-label={`${allOn ? "Remove" : "Grant"} all ${page} permissions`} aria-pressed={allOn} onClick={() => toggleAll(page, !allOn, actions)} style={{ background: "none", border: "none", cursor: "pointer", color: allOn ? "var(--primary)" : "var(--muted-foreground)", display: "flex" }}>
                          {allOn ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        </button>
                      </div>
                      {allActions.map((action) => {
                        const applicable = actions.includes(action);
                        const on = applicable && !!perms[action];
                        return (
                          <div key={action} style={{ padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {applicable ? (
                              <button aria-label={`${page}: ${action}`} aria-pressed={on} onClick={() => toggle(page, action)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", cursor: "pointer", backgroundColor: on ? "var(--primary)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}>
                                {on && <Check size={13} style={{ color: "#fff" }} strokeWidth={3} />}
                              </button>
                            ) : (
                              <div style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: "var(--muted)", opacity: 0.35 }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <FormError message={error} style={formErrorInModal} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 8, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {saving ? <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> : <Check size={14} />}
            {saving ? (isNew ? "Creating…" : "Saving…") : (isNew ? "Create Role" : "Save Changes")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const actionLabel = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);
const ACTION_ORDER = ["read", "create", "update", "delete"];

function RolesTab({ onRolesChange, canCreate, canUpdate, canDelete }: {
  onRolesChange: (roles: Role[]) => void; canCreate: boolean; canUpdate: boolean; canDelete: boolean;
}) {
  const [roles, setRoles]       = useState<Role[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [modal, setModal]       = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]   = useState<Partial<Role>>({});
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [delBusy, setDelBusy]   = useState(false);
  const [delErr, setDelErr]     = useState<string | null>(null);
  const [catalog, setCatalog]   = useState<string[]>([]);
  // The role form is built from the permission catalog. Until that request settles the
  // form would be built from a guess, so Create/Edit stay disabled while it's in flight.
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    api.get<any>(`/company/roles/permissions`)
      .then((raw) => setCatalog(normalizeCatalog(raw)))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogReady(true));
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    api.get<any[]>(`/company/roles`)
      .then((data) => {
        const mapped = (data ?? []).map(toRole);
        setRoles(mapped);
        onRolesChange(mapped);
      })
      .catch((e) => setLoadErr(loadErrText(e, "roles")))
      .finally(() => setLoading(false));
  }, [fetchKey]);

  const save = async (r: Role) => {
    const isNew = modal === "create";
    setSaveErr(null);
    setSaving(true);
    try {
      if (isNew) {
        await api.post(`/company/roles`, fromRole(r));
      } else {
        await api.put(`/company/roles/${r.id}`, fromRole(r));
      }
      setFetchKey((k) => k + 1);
      setModal(null);
      notify.success(isNew ? "Role created" : "Role updated");
    } catch (e) {
      setSaveErr(friendlyError(e, "Save failed")); // keep modal open
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (r: Role) => {
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/company/roles/${r.id}`);
      setFetchKey((k) => k + 1);
      setDeleting(null);
      notify.success(`${r.name || "Role"} removed`);
    } catch (e) {
      setDelErr(friendlyError(e, "Delete failed"));
    } finally {
      setDelBusy(false);
    }
  };

  // If catalog fetch failed/empty, derive pages from loaded roles + assume full CRUD
  const effectiveEntries: { page: string; actions: string[] }[] = parseCatalog(catalog).length > 0
    ? parseCatalog(catalog)
    : [...new Set(roles.flatMap((r) => Object.keys(r.permissions)))].map((page) => ({
        page,
        actions: ACTION_ORDER,
      }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
          <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{roles.length}</span> roles defined
        </span>
        {canCreate && (
          <button disabled={!catalogReady} onClick={() => { setEditing({}); setSaveErr(null); setModal("create"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: catalogReady ? "pointer" : "default", opacity: catalogReady ? 1 : 0.5 }}>
            <Plus size={14} /> Create Role
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <TH width={190}>Role Name</TH>
              {effectiveEntries.map(({ page }) => <TH key={page} width={140} align="center" style={{ textTransform: "capitalize" }}>{page}</TH>)}
              {/* Pinned right: with a dozen permission columns the table scrolls sideways,
                  and the actions must not scroll out of reach. */}
              <TH width={90} align="center" style={{ right: 0, zIndex: 6, boxShadow: "inset 1px 0 0 var(--border)" }}>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={effectiveEntries.length + 2} style={{ padding: 0 }}><PageLoader label="roles" /></td></tr>
            )}
            {!loading && loadErr && <LoadErrorRow colSpan={effectiveEntries.length + 2} message={loadErr} onRetry={() => setFetchKey((k) => k + 1)} />}
            {!loading && !loadErr && roles.map((r, i) => {
              return (
                <tr key={r.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--primary-faint)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ""; }}
                >
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{r.name}</span>
                    {(r.system || r.builtin) && (
                      <span title={r.system ? "The Owner role always has full access and can't be changed" : "Built-in role: it can't be renamed or deleted"}
                        style={{ marginLeft: 8, fontFamily: "var(--font-sans)", fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>
                        Built-in
                      </span>
                    )}
                  </td>
                  {effectiveEntries.map(({ page, actions }) => {
                    const perms = r.permissions[page] ?? {};
                    return (
                      <td key={page} style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12.5, lineHeight: 1.45, color: "var(--foreground)" }}>
                        {(() => {
                          const granted = actions.filter((a) => perms[a]);
                          if (granted.length === 0) return <Dash />;
                          if (granted.length === actions.length && actions.length > 1) return <span style={{ fontWeight: 600, color: "var(--secondary-foreground)" }}>Full access</span>;
                          return granted.map(actionLabel).join(", ");
                        })()}
                      </td>
                    );
                  })}
                  <td style={{ padding: "4px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center", position: "sticky", right: 0, backgroundColor: "var(--card)", boxShadow: "inset 1px 0 0 var(--border)" }}>
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      {/* Owner (system) can't be edited or deleted; Dispatcher/Updater (built-in) can't be deleted. */}
                      {canUpdate && !r.system && <ActionBtn label={`Edit ${r.name}`} icon={<Pencil size={14} />} tone="edit" onClick={() => { if (!catalogReady) return; setEditing(r); setSaveErr(null); setModal("edit"); }} />}
                      {canDelete && !r.system && !r.builtin && <ActionBtn label={`Delete ${r.name}`} icon={<Trash2 size={14} />} tone="delete" onClick={() => setDeleting(r)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>


      {(modal === "create" || modal === "edit") && (
        <RoleModal role={editing} entries={effectiveEntries} saving={saving} error={saveErr} onClose={() => { setModal(null); setSaveErr(null); }} onSave={(r) => { void save(r); }} />
      )}
      {deleting && <DeleteConfirm label={deleting.name} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={() => confirmDelete(deleting)} />}
      {saving && <div style={{ position: "fixed", inset: 0, zIndex: 200 }} />}
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

// ─── Week tab ─────────────────────────────────────────────────────────────────

function WeekTab({ canEdit }: { canEdit: boolean }) {
  const companyId = getCompanyId();
  const [startDay, setStartDay] = useState<number | null>(null); // null = still loading
  const [saving, setSaving]     = useState(false);
  const [loadError, setLoadError] = useState(false);
  // mc/name/eld are required on the owner company PUT body — fetched once and
  // echoed back unchanged alongside the new week_start_day.
  const companyRef = useRef<{ mc: string; name: string; eld?: string } | null>(null);

  useEffect(() => {
    if (!companyId) { setLoadError(true); return; }
    api.get<{ mc: string; name: string; eld?: string; week_start_day?: number }>(`/company`)
      .then((c) => {
        companyRef.current = { mc: c.mc, name: c.name, eld: c.eld };
        setStartDay(typeof c.week_start_day === "number" ? c.week_start_day : 1);
      })
      .catch(() => setLoadError(true));
  }, [companyId]);

  // The day picked but not yet saved. Changing the week start moves every weekly range on
  // Gross and Dashboard for the whole company, so a click only selects — Save commits.
  const [pending, setPending] = useState<number | null>(null);

  const save = async () => {
    const day = pending;
    if (!canEdit || startDay === null || day === null || day === startDay || saving || !companyRef.current) return;
    const prev = startDay;
    setStartDay(day); // optimistic
    setSaving(true);
    try {
      // The PUT replaces mc/name/eld too. Re-read them now so a rename made since this
      // tab opened isn't reverted by the copy fetched on mount.
      const fresh = await api.get<{ mc: string; name: string; eld?: string }>(`/company`);
      companyRef.current = { mc: fresh.mc, name: fresh.name, eld: fresh.eld };
      await api.put(`/company`, { ...companyRef.current, week_start_day: day });
      // Let the Gross page snap to the new current week immediately.
      window.dispatchEvent(new CustomEvent("week-settings-changed", { detail: { weekStartDay: day } }));
      setPending(null);
      notify.success("Work week updated");
    } catch (e) {
      setStartDay(prev);
      notify.error(friendlyError(e, "Couldn't save the work week — reverted."));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div style={{ padding: "32px 28px", fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>
        Couldn't load company settings.
      </div>
    );
  }
  if (startDay === null) return <PageLoader label="work week" />;

  // The picker previews the pending choice; startDay is what's actually saved.
  const shownStart = pending ?? startDay;
  const dirty  = pending !== null && pending !== startDay;
  const endDay = (shownStart + 6) % 7;

  return (
    <div style={{ padding: "32px 28px", display: "flex", flexDirection: "column", gap: 32, maxWidth: 520 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>Work Week</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          Choose which day your work week starts on. The Gross and Dashboard pages use this to calculate weekly ranges.
        </div>
      </div>

      {/* Day picker */}
      <div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Week starts on
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: saving || !canEdit ? 0.6 : 1, pointerEvents: saving || !canEdit ? "none" : "auto" }}>
          {WEEK_DAYS.map((label, idx) => {
            const isStart = idx === shownStart;
            const isEnd   = idx === endDay;
            const inRange = (() => {
              if (shownStart <= endDay) return idx >= shownStart && idx <= endDay;
              return idx >= shownStart || idx <= endDay;
            })();

            return (
              <button
                key={label}
                aria-pressed={isStart}
                aria-label={`Start the week on ${label}`}
                onClick={() => setPending(idx === startDay ? null : idx)}
                style={{
                  width: 64, height: 64, borderRadius: 12, border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  fontFamily: "var(--font-sans)",
                  backgroundColor: isStart ? "var(--primary)" : inRange ? "var(--primary-tint)" : "var(--muted)",
                  transition: "all 0.15s",
                  outline: isStart ? "3px solid var(--primary-glow)" : isEnd ? "2px solid var(--primary-glow)" : "none",
                  outlineOffset: 2,
                }}
                onMouseEnter={(e) => { if (!isStart) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary-soft)"; }}
                onMouseLeave={(e) => { if (!isStart) (e.currentTarget as HTMLButtonElement).style.backgroundColor = inRange ? "var(--primary-tint)" : "var(--muted)"; }}
              >
                <span style={{ fontSize: 13, fontWeight: isStart || isEnd ? 700 : 500, color: isStart ? "#fff" : inRange ? "var(--primary)" : "var(--muted-foreground)" }}>
                  {label}
                </span>
                {isStart && <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Start</span>}
                {isEnd   && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--primary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>End</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={{ backgroundColor: "var(--primary-tint)", border: "1px solid var(--primary-soft)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <CalendarDays size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
          {dirty ? "Your work week will run" : "Your work week runs"} <strong>{WEEK_DAYS[shownStart]}</strong> → <strong>{WEEK_DAYS[endDay]}</strong>
        </span>
      </div>

      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { void save(); }} disabled={!dirty || saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 7, border: "none", backgroundColor: dirty ? "var(--primary)" : "var(--muted)", color: dirty ? "#fff" : "var(--muted-foreground)", cursor: dirty && !saving ? "pointer" : "default", opacity: saving ? 0.75 : 1 }}>
            <Check size={14} /> {saving ? "Saving…" : "Save"}
          </button>
          {dirty && !saving && (
            <button onClick={() => setPending(null)}
              style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 14px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ELD CONNECTION TAB ───────────────────────────────────────────────────────

interface EldConnection {
  provider: string;
  connected: boolean;
  company?: string;        // who the provider says the key belongs to — the owner's confirmation
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string;     // last poll failure, so a revoked key is visible
}

// Only `noor` has an integration today; other providers answer 400 unknown_provider.
const ELD_PROVIDERS = [{ value: "noor", label: "Noor ELD" }];

function fmtWhen(iso?: string | null): string {
  if (!iso) return "—";
  return fmtDateTime(iso) || "—";
}

// Connect the company's own ELD provider. The connection lives at /eld (separate from the
// company's `eld` display label); credentials are verified with the provider before the
// backend stores them, and never returned — to change a key you replace it.
function EldTab({ canManage }: { canManage: boolean }) {
  const [conn, setConn]     = useState<EldConnection | null>(null);
  const [state, setState]   = useState<"loading" | "connected" | "disconnected" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [provider, setProvider] = useState("noor");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    setState("loading"); setErrMsg(null);
    api.get<EldConnection>("/eld")
      .then((c) => { setConn(c); setState(c.connected ? "connected" : "disconnected"); })
      .catch((e) => {
        if (e instanceof ApiError && e.code === "eld_not_connected") { setConn(null); setState("disconnected"); }
        else { setErrMsg(eldErrorMessage(e)); setState("error"); }
      });
  };
  useEffect(load, []);

  const connect = async () => {
    if (!apiKey.trim()) return;
    setSaving(true); setErrMsg(null);
    try {
      const c = await api.put<EldConnection>("/eld", { provider, credentials: { api_key: apiKey.trim() } });
      setConn(c); setState("connected"); setApiKey("");
    } catch (e) { setErrMsg(eldErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const disconnect = async () => {
    setSaving(true); setErrMsg(null);
    try { await api.delete("/eld"); setConn(null); setState("disconnected"); setApiKey(""); setConfirming(false); notify.success("ELD disconnected"); }
    catch (e) { setErrMsg(eldErrorMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>ELD connection</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Connect your electronic-logging-device provider so the board goes live off its telemetry — where each truck is, its speed, and its duty status.
          </div>
        </div>

        {!confirming && <FormError message={errMsg} />}

        {state === "loading" ? (
          <PageLoader label="ELD settings" />
        ) : state === "error" ? (
          // The status is unknown, not "disconnected" — offering the connect form here
          // would invite replacing a connection that may be working fine.
          <button onClick={load}
            style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
            Try again
          </button>
        ) : state === "connected" && conn ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18, border: "1px solid var(--border)", borderRadius: 12, backgroundColor: "var(--background)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "rgba(16,185,129,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Truck size={17} color="#10B981" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                  {ELD_PROVIDERS.find((p) => p.value === conn.provider)?.label ?? conn.provider}
                  <span style={{ marginLeft: 8, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)", borderRadius: 4, padding: "2px 7px" }}>Connected</span>
                </div>
                {conn.company && <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{conn.company}</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontFamily: "var(--font-sans)", fontSize: 12 }}>
              <div><span style={{ color: "var(--muted-foreground)" }}>Connected</span><div style={{ color: "var(--foreground)", marginTop: 2 }}>{fmtWhen(conn.connected_at)}</div></div>
              <div><span style={{ color: "var(--muted-foreground)" }}>Last sync</span><div style={{ color: "var(--foreground)", marginTop: 2 }}>{fmtWhen(conn.last_sync_at)}</div></div>
            </div>
            {conn.last_error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8 }}>
                <AlertCircle size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#F59E0B", lineHeight: 1.5 }}>Last poll failed: {conn.last_error}. The key may have been revoked — reconnect with a valid one.</div>
              </div>
            )}
            {canManage && (
              <button onClick={() => { setErrMsg(null); setConfirming(true); }} disabled={saving}
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.4)", backgroundColor: "transparent", color: "#EF4444", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                <Unlink size={13} /> Disconnect
              </button>
            )}
          </div>
        ) : canManage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18, border: "1px solid var(--border)", borderRadius: 12, backgroundColor: "var(--background)" }}>
            <div style={fieldStyle}>
              <span style={capStyle}>Provider</span>
              <CustomSelect value={provider} options={ELD_PROVIDERS} onChange={setProvider} />
            </div>
            <label style={fieldStyle}>
              <span style={capStyle}>API key</span>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste the key from your provider's portal" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} autoComplete="off" />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>Verified with the provider before it's saved. It's sealed and never shown again — to change it, connect again.</span>
            </label>
            <button onClick={connect} disabled={saving || !apiKey.trim()}
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 7, border: "none", backgroundColor: saving || !apiKey.trim() ? "var(--muted)" : "var(--primary)", color: saving || !apiKey.trim() ? "var(--muted-foreground)" : "#fff", cursor: saving || !apiKey.trim() ? "default" : "pointer" }}>
              <Check size={14} /> {saving ? "Connecting…" : "Connect"}
            </button>
          </div>
        ) : (
          <div style={{ padding: "40px 0", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No ELD connected.</div>
        )}
      </div>

      {confirming && (
        <ModalShell label="Disconnect ELD" onClose={() => { setConfirming(false); setErrMsg(null); }} busy={saving}>
          <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 400, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.14)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Unlink size={20} color="#EF4444" />
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Disconnect your ELD?</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.55, marginBottom: errMsg ? 14 : 20 }}>
              The board stops receiving live truck locations, speed and duty status until you connect again.
            </div>
            <FormError message={errMsg} style={{ marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => { setConfirming(false); setErrMsg(null); }} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
              <button onClick={() => { void disconnect(); }} disabled={saving} style={{ minWidth: 110, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 8, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.8 : 1 }}>
                {saving ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

type TabId = "users" | "teams" | "roles" | "week" | "eld";

export function SettingsPage() {
  const { user } = useAuth();
  // Each tab is gated on its own company-plane read key; the tab renders on read, its
  // create/edit/delete controls on the matching write key. Owners hold everything.
  const can = (module: string, action: string = "read") => hasPerm(user, module, action);
  const canEldUpdate = can("eld", "update");
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // Roles and teams feed the Users tab's columns and pickers. That tab pulls them when it
  // opens; the Roles tab reports its own list through onRolesChange — so nothing is
  // fetched twice, and nothing is fetched for a tab that isn't on screen.
  const reloadTeams = () => {
    if (!can("teams")) return Promise.resolve();
    return api.get<any[]>(`/company/teams`)
      .then((data) => setTeams((data ?? []).map(toTeam)))
      .catch(() => {});
  };
  const reloadRoles = () => {
    if (!can("roles")) return Promise.resolve();
    return api.get<any[]>(`/company/roles`)
      .then((data) => setRoles((data ?? []).map(toRole)))
      .catch(() => {});
  };

  const TAB_DEFS: { id: TabId; label: string; icon: React.ReactNode; module: string }[] = [
    { id: "users",  label: "Users",               icon: <Users        size={15} />, module: "users" },
    { id: "teams",  label: "Teams",               icon: <UsersRound   size={15} />, module: "teams" },
    { id: "roles",  label: "Roles & Permissions", icon: <ShieldCheck  size={15} />, module: "roles" },
    { id: "week",   label: "Work Week",           icon: <CalendarDays size={15} />, module: "settings" },
    { id: "eld",    label: "ELD",                 icon: <Truck        size={15} />, module: "eld" },
  ];
  const tabs = TAB_DEFS.filter((t) => can(t.module));

  // The open tab is the URL's last segment (/workspace/settings/teams), so a refresh or a
  // shared link lands on the same tab. A missing, unknown or no-longer-permitted segment
  // (e.g. after a company switch) falls back to the first tab the user can open.
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split("/").filter(Boolean)[2];
  const tab: TabId | null = tabs.find((t) => t.id === segment)?.id ?? tabs[0]?.id ?? null;
  const setTab = (id: TabId) => navigate(`/workspace/settings/${id}`);
  useEffect(() => {
    if (tab && segment !== tab) navigate(`/workspace/settings/${tab}`, { replace: true });
  }, [tab, segment, navigate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      <div role="tablist" aria-label="Settings sections" style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 12px", flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 2, overflowX: "auto" }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 14px", whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 500,
              color: active ? "var(--primary)" : "var(--muted-foreground)",
              backgroundColor: "transparent", border: "none",
              borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
              cursor: "pointer", transition: "color 0.15s, border-color 0.15s", marginBottom: -1,
            }}>
              <span style={{ display: "flex", opacity: active ? 1 : 0.7 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "14px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          {tab === "users" && <UsersTab roles={roles} teams={teams} reloadTeams={reloadTeams} reloadRoles={reloadRoles} canCreate={can("users", "create")} canUpdate={can("users", "update")} canDelete={can("users", "delete")} />}
          {tab === "teams" && <TeamsTab canCreate={can("teams", "create")} canUpdate={can("teams", "update")} canDelete={can("teams", "delete")} />}
          {tab === "roles" && <RolesTab onRolesChange={setRoles} canCreate={can("roles", "create")} canUpdate={can("roles", "update")} canDelete={can("roles", "delete")} />}
          {tab === "week"  && <WeekTab canEdit={can("settings", "update")} />}
          {tab === "eld"   && <EldTab canManage={canEldUpdate} />}
        </div>
      </div>
    </div>
  );
}

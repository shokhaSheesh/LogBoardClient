import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Trello,
  BarChart2,
  Package,
  Users,
  Truck,
  DollarSign,
  CreditCard,
  Settings,
  ChevronRight,
  ChevronDown,
  Search,
  Bell,
  Menu,
  Check,
  LogOut,
  Sun,
  Moon,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { hasPerm, isOwnerPlanePage } from "../lib/permissions";
import { api, setCompanyId, getCompanyId } from "../lib/api";
import { useBoardPresence } from "../lib/useBoardPresence";
import { useEntitlement, type EntitlementCopy } from "../lib/entitlement";

// ─── Account types ──────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  initials: string;
  color: string;
  plan: string;
  mc?: string; // motor-carrier number — owner-only (from /owner/companies), absent for dispatcher/updater
}

// ─── Account Switcher (top header, right-aligned dropdown) ────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--muted-foreground)", padding: "7px 10px 4px",
};

function AccountSwitcher({
  accounts, activeId, onSwitch,
}: {
  accounts: Account[];
  activeId: string;
  onSwitch: (id: string) => void;
}) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  // Billing & Settings are owner self-service (/owner/*) — hidden for dispatcher/updater.
  const isOwner = user?.role === "owner";
  const menuItems = isOwner ? USER_MENU_ITEMS : [];
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;
  const PANEL_WIDTH = 264;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  const toggle = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        !anchorRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!active) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 10px" }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: "var(--muted)", flexShrink: 0 }} />
      <div style={{ height: 10, width: 90, borderRadius: 4, backgroundColor: "var(--muted)" }} />
    </div>
  );

  return (
    <>
      <button
        ref={anchorRef}
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          height: 40, padding: "5px 10px 5px 6px",
          border: "1px solid var(--border)", borderRadius: 9,
          backgroundColor: open ? "var(--accent)" : "var(--muted)",
          cursor: "pointer", maxWidth: 220,
        }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)"; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
      >
        {/* Company avatar */}
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: active.color, fontSize: 10, fontWeight: 700, color: "#fff",
        }}>
          {active.initials}
        </div>

        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {active.name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {active.mc ? `${active.mc} · ` : ""}{active.plan || "No"} Plan
          </div>
        </div>
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
      </button>

      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: rect.bottom + 6,
            left: Math.max(8, rect.right - PANEL_WIDTH),
            width: PANEL_WIDTH,
            boxSizing: "border-box",
            zIndex: 9999,
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            padding: "5px",
            maxHeight: "calc(100vh - 90px)",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <div style={sectionLabelStyle}>Companies</div>

          {/* Account list */}
          {accounts.map((acc) => {
            const isActive = acc.id === activeId;
            return (
              <button
                key={acc.id}
                onMouseDown={(e) => { e.preventDefault(); onSwitch(acc.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "none", borderRadius: 8,
                  backgroundColor: isActive ? "var(--secondary)" : "transparent",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: acc.color, fontSize: 11, fontWeight: 700, color: "#fff",
                }}>
                  {acc.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {acc.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {acc.mc ? `${acc.mc} · ` : ""}{acc.plan || "No"} Plan
                  </div>
                </div>
                {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
              </button>
            );
          })}

          {/* Account section — Billing/Settings only for owners */}
          {menuItems.length > 0 && (
            <>
              <div style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />
              <div style={sectionLabelStyle}>Account</div>
              {menuItems.map(({ icon: Icon, label, path }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setOpen(false)}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 8, textDecoration: "none",
                    fontFamily: "var(--font-sans)", fontSize: 13,
                    color: isActive ? "var(--primary)" : "var(--foreground)",
                    backgroundColor: isActive ? "var(--secondary)" : "transparent",
                  })}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = ""; }}
                >
                  <Icon size={14} style={{ flexShrink: 0, color: "var(--muted-foreground)" }} />
                  {label}
                </NavLink>
              ))}
            </>
          )}

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />

          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "none", borderRadius: 8,
              backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
              fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(239,68,68,0.07)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            Sign out
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Logo (placeholder — swap for a real mark whenever one exists) ────────────

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <NavLink
      to="/workspace/dashboard"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: collapsed ? "14px 0" : "14px 16px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderBottom: "1px solid var(--sidebar-border)",
        textDecoration: "none",
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "var(--sidebar-primary)", fontSize: 14, fontWeight: 800, color: "#fff",
      }}>
        LB
      </div>
      {!collapsed && (
        <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.01em" }}>
          Log Board
        </span>
      )}
    </NavLink>
  );
}

// ─── Navigation config ─────────────────────────────────────────────────────

interface NavItem { icon: React.ElementType; label: string; path: string; module: string; }
interface NavSection { title: string; items: NavItem[]; }

// Sidebar grouping. Dashboard sits alone at the top; then Operations (Board and
// Loads — the pages dispatchers live in), the Fleet roster, and the money views.
const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "dashboard", module: "dashboard" },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: Trello,  label: "Board", path: "board", module: "board" },
      { icon: Package, label: "Loads", path: "loads", module: "loads" },
    ],
  },
  {
    title: "Fleet",
    items: [
      { icon: Users, label: "Drivers",    path: "drivers",    module: "drivers"    },
      { icon: Truck, label: "Equipments", path: "equipments", module: "equipments" },
    ],
  },
  {
    title: "Financials",
    items: [
      { icon: BarChart2,  label: "Gross",   path: "gross",   module: "gross"   },
      { icon: DollarSign, label: "Payouts", path: "payouts", module: "payouts" },
    ],
  },
];

// ─── Active-user presence helpers ────────────────────────────────────────────

const PRESENCE_COLORS = ["#8B5CF6", "#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#EC4899", "#14B8A6"];

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

// Stable colour per user id so an avatar keeps its colour across renders.
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

// ─── User menu (sidebar bottom) ───────────────────────────────────────────────

const USER_MENU_ITEMS: { icon: React.ElementType; label: string; path: string }[] = [
  { icon: CreditCard, label: "Billing",  path: "/workspace/billing"  },
  { icon: Settings,   label: "Settings", path: "/workspace/settings" },
];

// Static — just shows who's signed in. Billing/Settings/Sign out live in the
// account switcher (top-right) instead of a second menu down here.
function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();

  const initials = user?.full_name
    ? user.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : "??";

  return (
    <div
      className="mx-2 mb-3"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        backgroundColor: "var(--sidebar-accent)",
        borderRadius: 12,
        padding: collapsed ? "10px 0" : "12px",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #3B82F6, #6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
        {initials}
      </div>
      {!collapsed && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.full_name ?? "—"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--sidebar-foreground)", opacity: 0.65, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10B981", flexShrink: 0 }} />
            {user?.role ?? "—"} · Online
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, onToggle }: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const { user } = useAuth();

  // Only show pages the current user's company role can open, then drop any section
  // left empty (e.g. an updater with no Financials access shows just Operations).
  const visibleSections = navSections
    .map((sec) => ({ ...sec, items: sec.items.filter((n) => hasPerm(user, n.module)) }))
    .filter((sec) => sec.items.length > 0);

  return (
    <aside
      style={{
        backgroundColor: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
        width: collapsed ? 64 : 220,
        minWidth: collapsed ? 64 : 220,
        transition: "width 300ms ease-in-out, min-width 300ms ease-in-out",
      }}
      className="h-full flex flex-col overflow-hidden"
      aria-label="Main navigation"
    >
      <Logo collapsed={collapsed} />

      {/* Nav sections */}
      <nav className="flex-1 px-2 py-2 flex flex-col overflow-y-auto">
        {visibleSections.map((section, si) => (
          <div key={section.title} className="flex flex-col gap-0.5" style={{ marginTop: si === 0 ? 0 : 14 }}>
            {!collapsed ? (
              <div
                className="px-2 pt-1 pb-1"
                style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sidebar-foreground)", opacity: 0.45 }}
              >
                {section.title}
              </div>
            ) : si > 0 ? (
              // Collapsed rail: a thin divider stands in for the section heading.
              <div style={{ height: 1, backgroundColor: "var(--sidebar-border)", margin: "6px 12px 8px" }} />
            ) : null}
            {section.items.map(({ icon: Icon, label, path }) => {
              const isActive =
                location.pathname === `/workspace/${path}` ||
                location.pathname.startsWith(`/workspace/${path}/`);
              return (
                <NavLink
                  key={path}
                  to={`/workspace/${path}`}
                  title={collapsed ? label : undefined}
                  className="flex items-center gap-3 rounded-lg w-full transition-all duration-150"
                  style={{
                    padding: collapsed ? "10px 0" : "9px 12px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? "var(--sidebar-primary-foreground)"
                      : "var(--sidebar-foreground)",
                    backgroundColor: isActive ? "var(--sidebar-primary)" : "transparent",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                        "var(--sidebar-accent)";
                      (e.currentTarget as HTMLAnchorElement).style.color =
                        "var(--sidebar-accent-foreground)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                        isActive ? "var(--sidebar-primary)" : "transparent";
                      (e.currentTarget as HTMLAnchorElement).style.color =
                        isActive
                          ? "var(--sidebar-primary-foreground)"
                          : "var(--sidebar-foreground)";
                    }
                  }}
                >
                  <Icon
                    size={16}
                    strokeWidth={isActive ? 2.5 : 2}
                    style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{label}</span>
                      {isActive && <ChevronRight size={14} style={{ opacity: 0.6 }} />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User profile card */}
      <UserCard collapsed={collapsed} />
    </aside>
  );
}

// ─── Active Users (multiplayer presence placeholder) ─────────────────────────

const AVATAR_CAP = 3;

function ActiveUsers({ companyId }: { companyId: string }) {
  const { count, users } = useBoardPresence(companyId);
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen]       = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const wrapRef  = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shown = users.slice(0, AVATAR_CAP);
  const overflow = count - shown.length;

  const toggleOpen = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((v) => !v);
  };

  // Close the full-list panel on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !wrapRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={wrapRef} className="flex items-center gap-2">
      <div
        onClick={toggleOpen}
        className="flex items-center"
        style={{ cursor: count > 0 ? "pointer" : "default" }}
      >
        {shown.map((user, i) => (
          <div
            key={user.id}
            onMouseEnter={() => setHovered(user.id)}
            onMouseLeave={() => setHovered((h) => (h === user.id ? null : h))}
            style={{ position: "relative", marginLeft: i > 0 ? -8 : 0, zIndex: hovered === user.id ? 100 : shown.length - i }}
          >
            <Avatar
              className="border-2 border-white transition-transform hover:scale-110 cursor-pointer"
              style={{ width: 30, height: 30, position: "relative" }}
            >
              <AvatarFallback
                style={{
                  backgroundColor: colorFor(user.id),
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {initialsOf(user.name)}
              </AvatarFallback>
            </Avatar>
            {/* Hover tooltip — name + role */}
            {hovered === user.id && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                  backgroundColor: "#1F2937", color: "#fff", borderRadius: 7, padding: "5px 10px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.22)", whiteSpace: "nowrap", textAlign: "center",
                  pointerEvents: "none", zIndex: 200,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{user.name}</div>
                <div style={{ fontSize: 10, opacity: 0.7, textTransform: "capitalize", lineHeight: 1.3 }}>{user.role}</div>
                {/* caret */}
                <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "4px solid #1F2937" }} />
              </div>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div
            title={`+${overflow} more online — click to see everyone`}
            style={{
              width: 30, height: 30, marginLeft: shown.length > 0 ? -8 : 0,
              borderRadius: "50%", border: "2px solid white", backgroundColor: "var(--muted)",
              color: "var(--muted-foreground)", fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
            }}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span
        onClick={toggleOpen}
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          whiteSpace: "nowrap",
          cursor: count > 0 ? "pointer" : "default",
        }}
      >
        <span style={{ color: count > 0 ? "#10B981" : "#9CA3AF", fontWeight: 600 }}>●</span>{" "}
        {count} online
      </span>

      {/* Full online-users list — a dropdown panel, not a separate page */}
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed", top: panelPos.top, right: panelPos.right,
            width: 280, maxHeight: 420,
            backgroundColor: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 9999, display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
              Online now <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#10B981", backgroundColor: "#D1FAE5", borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{count}</span>
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {users.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No one else online</div>
            ) : (
              users.map((user) => (
                <div key={user.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px" }}>
                  <Avatar style={{ width: 28, height: 28, flexShrink: 0 }}>
                    <AvatarFallback style={{ backgroundColor: colorFor(user.id), color: "#fff", fontSize: 10, fontWeight: 600 }}>
                      {initialsOf(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", textTransform: "capitalize" }}>{user.role}</div>
                  </div>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#10B981", flexShrink: 0 }} />
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Notification Bell ───────────────────────────────────────────────────────

interface NotifItem {
  id: string; kind: string; title: string; body: string;
  entity_type?: string; entity_id?: string;
  read: boolean; created_at: string;
}
interface NotifResponse { items: NotifItem[]; unread_count: number; }

function NotificationBell() {
  const [open, setOpen]             = useState(false);
  const [items, setItems]           = useState<NotifItem[]>([]);
  const [unread, setUnread]         = useState(0);
  const [loading, setLoading]       = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  const fetchNotifs = () => {
    setLoading(true);
    api.get<NotifResponse>("/notifications")
      .then((data) => { setItems(data?.items ?? []); setUnread(data?.unread_count ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 2 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const markOne = (id: string) => {
    api.patch(`/notifications/${id}`, { read: true }).catch(() => {});
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((c) => Math.max(0, c - 1));
  };

  const markAll = () => {
    api.post("/notifications/read-all").catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-lg transition-colors"
        style={{ width: 34, height: 34, backgroundColor: open ? "var(--accent)" : "var(--muted)" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = open ? "var(--accent)" : "var(--muted)")}
      >
        <Bell size={16} style={{ color: "var(--foreground)" }} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 5, right: 5,
            minWidth: 7, height: 7, borderRadius: "50%",
            backgroundColor: "#EF4444", border: "1.5px solid var(--card)",
          }} />
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: 68, right: 24,
            width: 360, maxHeight: 480,
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 9999,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)", flex: 1 }}>
              Notifications {unread > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#EF4444", backgroundColor: "rgba(239,68,68,0.14)", borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{unread}</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {loading && items.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No notifications yet</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.read) markOne(n.id); }}
                  style={{
                    display: "flex", gap: 10, padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: n.read ? "transparent" : "var(--secondary)",
                    cursor: n.read ? "default" : "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!n.read) (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = n.read ? "transparent" : "var(--secondary)"; }}
                >
                  {/* Unread dot */}
                  <div style={{ flexShrink: 0, width: 7, height: 7, borderRadius: "50%", backgroundColor: n.read ? "transparent" : "#3B82F6", marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: n.read ? 400 : 600, color: "var(--foreground)", marginBottom: 2 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex items-center justify-center rounded-lg transition-colors"
      style={{ width: 34, height: 34, backgroundColor: "var(--muted)" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--accent)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)")}
    >
      {isDark ? <Sun size={16} style={{ color: "var(--foreground)" }} /> : <Moon size={16} style={{ color: "var(--foreground)" }} />}
    </button>
  );
}

// ─── Top Header ──────────────────────────────────────────────────────────────

function TopHeader({ onToggleSidebar, accounts, activeAccountId, onSwitch }: {
  onToggleSidebar: () => void;
  accounts: Account[];
  activeAccountId: string;
  onSwitch: (id: string) => void;
}) {
  const location = useLocation();
  const segments = location.pathname.replace("/workspace/", "").split("/");
  const pageLabel =
    segments[0].charAt(0).toUpperCase() + segments[0].slice(1) || "Dashboard";

  return (
    <header
      className="flex items-center gap-4 px-6 border-b shrink-0"
      style={{
        height: 64,
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{ width: 34, height: 34, color: "var(--muted-foreground)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--muted)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "transparent")
          }
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>
            Workspace
          </span>
          <ChevronRight size={14} style={{ opacity: 0.5, color: "var(--muted-foreground)" }} />
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>
            {pageLabel}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Right: active users + bell + account switcher */}
      <div className="flex items-center gap-4">
        <ActiveUsers companyId={activeAccountId} />

        <ThemeToggle />

        <NotificationBell />

        <div style={{ width: 1, height: 24, backgroundColor: "var(--border)" }} />

        <AccountSwitcher
          accounts={accounts}
          activeId={activeAccountId}
          onSwitch={onSwitch}
        />
      </div>
    </header>
  );
}

// ─── Plan gate ────────────────────────────────────────────────────────────────

// Shown in place of the page when the company isn't entitled. A dispatcher can't fix
// this themselves — billing lives under /owner/* — so they get the reason and nothing
// that would only 403. An owner gets a way through to Billing, which stays reachable.
function EntitlementBlock({ copy, isOwner }: { copy: EntitlementCopy; isOwner: boolean }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Lock size={24} color="#F59E0B" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>
          {copy.title}
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          {copy.body}
        </div>
        {isOwner && (
          <NavLink
            to="/workspace/billing"
            style={{ marginTop: 4, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 7, backgroundColor: "var(--primary)", color: "#fff", textDecoration: "none" }}
          >
            Go to Billing
          </NavLink>
        )}
      </div>
    </div>
  );
}

// ─── CompanyLayout ────────────────────────────────────────────────────────────

export function CompanyLayout() {
  const { user, refresh } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState(getCompanyId());

  // Fetch real accounts for owners; dispatcher/updater have a fixed company_id from login
  useEffect(() => {
    if (user?.role === "owner") {
      Promise.all([
        api.get<Account[]>("/owner/accounts"),
        // MC number isn't on /owner/accounts — pull it from the full company
        // records and merge by id. Best-effort: an owner with no company access
        // just won't see MC, which is fine.
        api.get<{ id: string; mc?: string }[]>("/owner/companies").catch(() => []),
      ]).then(([data, companies]) => {
          const mcById = new Map(companies.map((c) => [c.id, c.mc]));
          const merged = data.map((a) => ({ ...a, mc: mcById.get(a.id) }));
          setAccounts(merged);
          // Auto-select: prefer the one already in localStorage, else first
          const saved = getCompanyId();
          const match = merged.find((a) => a.id === saved) ?? merged[0];
          if (match) {
            setActiveAccountId(match.id);
            setCompanyId(match.id);
          }
        })
        .catch(() => {/* silently ignore — switcher stays empty */});
    } else if (user?.company_id) {
      // dispatcher / updater — pinned to one company and 403 on /owner/accounts, so
      // build their single non-switchable entry from the company object /auth/me
      // resolves for them. Keeps the switcher (and its Sign-out) rendering.
      setActiveAccountId(user.company_id);
      const c = user.company;
      setAccounts([{
        id:       c?.id       ?? user.company_id,
        name:     c?.name     ?? "My Company",
        initials: c?.initials ?? initialsOf(c?.name ?? "My Company"),
        color:    c?.color    ?? colorFor(user.company_id),
        plan:     c?.plan     ?? "",
        mc:       c?.mc,
      }]);
    }
  }, [user]);

  const [switching, setSwitching] = useState(false);
  const { blocked, readOnly, copy, clear: clearEntitlement } = useEntitlement();

  // Billing and Settings run on /owner/* endpoints, which the backend deliberately
  // keeps outside the plan gate so an unentitled company can still record a
  // subscription. Locking an owner out of them would strand them with no way back in.
  const currentPage = useLocation().pathname.replace(/^\/workspace\/?/, "");
  const gateApplies = !isOwnerPlanePage(currentPage);

  const switchAccount = (id: string) => {
    if (id === activeAccountId) return;
    setSwitching(true);
    setActiveAccountId(id);
    setCompanyId(id);
    // The plan gate is per-company: the one we just left being locked says nothing
    // about this one. Drop the verdict and let the new company's requests speak.
    clearEntitlement();
    // Permissions are resolved per-company — re-pull them for the new active company.
    void refresh();
    setTimeout(() => setSwitching(false), 800);
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "var(--font-sans)", backgroundColor: "var(--background)" }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSwitch={switchAccount}
        />

        {/* The board still reads during the grace window — say so once, at the top,
            rather than letting every save fail with a bare error toast. */}
        {readOnly && copy && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", backgroundColor: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.35)", flexShrink: 0 }}>
            <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#F59E0B", lineHeight: 1.4 }}>
              <strong style={{ fontWeight: 700 }}>{copy.title}.</strong> {copy.body}
            </span>
          </div>
        )}

        <main
          key={activeAccountId}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "var(--background)" }}
        >
          {/* A hard gate 403s reads too, so there is nothing for the page to render —
              show why instead of a shell full of failed widgets and error toasts. */}
          {blocked && copy && gateApplies
            ? <EntitlementBlock copy={copy} isOwner={user?.role === "owner"} />
            : <Outlet />}
        </main>
      </div>

      {switching && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "var(--card)", borderRadius: 16, padding: "28px 36px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 24px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              Switching account…
            </span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

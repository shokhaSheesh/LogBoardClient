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
  Plus,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { useAuth } from "../lib/auth";
import { api, setCompanyId, getCompanyId } from "../lib/api";

// ─── Account types ──────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  initials: string;
  color: string;
  plan: string;
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

// ─── Account Switcher ────────────────────────────────────────────────────────

function AccountSwitcher({
  accounts, activeId, onSwitch, onAdd, collapsed,
}: {
  accounts: Account[];
  activeId: string;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  collapsed: boolean;
}) {
  const [open, setOpen]         = useState(false);
  const [adding, setAdding]     = useState(false);
  const [draft, setDraft]       = useState("");
  const [rect, setRect]         = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null;

  const toggle = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((v) => !v);
    if (open) { setAdding(false); setDraft(""); }
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        !anchorRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) { setOpen(false); setAdding(false); setDraft(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  if (!active) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: collapsed ? "14px 0" : "12px 16px",
      justifyContent: collapsed ? "center" : "flex-start",
      borderBottom: "1px solid var(--sidebar-border)",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
      {!collapsed && <div style={{ height: 12, width: 100, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.07)" }} />}
    </div>
  );

  const commitAdd = () => {
    const name = draft.trim();
    if (!name) return;
    onAdd(name);
    setDraft("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: collapsed ? "14px 0" : "12px 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          border: "none", background: "none", cursor: "pointer",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Company avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: active.color, fontSize: 12, fontWeight: 700, color: "#fff",
        }}>
          {active.initials}
        </div>

        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {active.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--sidebar-foreground)", opacity: 0.6 }}>
                {active.plan} Plan
              </div>
            </div>
            <ChevronDown size={14} style={{ color: "var(--sidebar-foreground)", opacity: 0.5, flexShrink: 0 }} />
          </>
        )}
      </button>

      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: rect.bottom + 6,
            left: rect.left,
            width: Math.max(rect.width, 240),
            zIndex: 9999,
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            padding: "5px",
            overflow: "hidden",
          }}
        >
          {/* Account list */}
          {accounts.map((acc) => {
            const isActive = acc.id === activeId;
            return (
              <button
                key={acc.id}
                onMouseDown={(e) => { e.preventDefault(); onSwitch(acc.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "8px 10px", border: "none", borderRadius: 8,
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
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>
                    {acc.plan} Plan
                  </div>
                </div>
                {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />

          {/* Add new account */}
          {adding ? (
            <div style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitAdd(); }
                  if (e.key === "Escape") { setAdding(false); setDraft(""); }
                }}
                placeholder="Company name…"
                style={{
                  flex: 1, border: "1px solid var(--border)", borderRadius: 6,
                  padding: "5px 8px", fontFamily: "var(--font-sans)", fontSize: 12,
                  color: "var(--foreground)", backgroundColor: "var(--muted)", outline: "none",
                }}
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); commitAdd(); }}
                disabled={!draft.trim()}
                style={{
                  padding: "5px 10px", border: "none", borderRadius: 6,
                  backgroundColor: draft.trim() ? "var(--primary)" : "var(--muted)",
                  color: draft.trim() ? "#fff" : "var(--muted-foreground)",
                  fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
                  cursor: draft.trim() ? "pointer" : "default",
                }}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onMouseDown={(e) => { e.preventDefault(); setAdding(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 10px", border: "none", borderRadius: 8,
                backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"}
              onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px dashed var(--border)",
              }}>
                <Plus size={13} style={{ color: "var(--muted-foreground)" }} />
              </div>
              <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-sans)" }}>
                Add new account
              </span>
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Navigation config ─────────────────────────────────────────────────────

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",  path: "dashboard"   },
  { icon: Trello,          label: "Board",       path: "board"       },
  { icon: BarChart2,       label: "Gross",       path: "gross"       },
  { icon: Package,         label: "Loads",       path: "loads"       },
  { icon: Users,           label: "Drivers",     path: "drivers"     },
  { icon: Truck,           label: "Equipments",  path: "equipments"  },
  { icon: DollarSign,      label: "Payouts",     path: "payouts"     },
];

// ─── Active-user presence data (placeholder) ────────────────────────────────

const activeUsers = [
  { initials: "SR", color: "#8B5CF6", name: "Sofia R." },
  { initials: "MT", color: "#F59E0B", name: "Marcus T." },
  { initials: "JR", color: "#10B981", name: "Jake R." },
];

// ─── User menu ───────────────────────────────────────────────────────────────

const USER_MENU_ITEMS: { icon: React.ElementType; label: string; path: string }[] = [
  { icon: CreditCard, label: "Billing",  path: "/workspace/billing"  },
  { icon: Settings,   label: "Settings", path: "/workspace/settings" },
];

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ bottom: 0, left: 0, width: 0 });

  const initials = user?.full_name
    ? user.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : "??";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current && !ref.current.contains(t) &&
        popupRef.current && !popupRef.current.contains(t)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ bottom: window.innerHeight - r.top + 6, left: r.left, width: r.width });
    }
    setOpen((v) => !v);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div ref={ref} className="mx-2 mb-3">
      <button
        onClick={handleOpen}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          backgroundColor: open ? "var(--sidebar-primary)" : "var(--sidebar-accent)",
          border: "none", borderRadius: 12, cursor: "pointer", textAlign: "left",
          padding: collapsed ? "10px 0" : "12px",
          justifyContent: collapsed ? "center" : "flex-start",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--sidebar-accent-hover, rgba(255,255,255,0.06))"; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--sidebar-accent)"; }}
      >
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #3B82F6, #6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
          {initials}
        </div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.full_name ?? "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--sidebar-foreground)", opacity: 0.65 }}>
                {user?.role ?? "—"} · Online
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10B981" }} />
              <ChevronDown size={13} style={{ color: "var(--sidebar-foreground)", opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </div>
          </>
        )}
      </button>

      {open && createPortal(
        <div ref={popupRef} style={{
          position: "fixed", bottom: pos.bottom, left: pos.left,
          width: Math.max(pos.width, 180),
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          zIndex: 500, overflow: "hidden", padding: "4px 0",
        }}>
          {USER_MENU_ITEMS.map(({ icon: Icon, label, path }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setOpen(false)}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", textDecoration: "none",
                fontFamily: "var(--font-sans)", fontSize: 13,
                color: isActive ? "var(--primary)" : "var(--foreground)",
                backgroundColor: isActive ? "var(--secondary)" : "transparent",
              })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = ""; }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} />
              {label}
            </NavLink>
          ))}

          <div style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />

          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "9px 14px", border: "none", borderRadius: 0,
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
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, onToggle, accounts, activeAccountId, onSwitch, onAddAccount }: {
  collapsed: boolean;
  onToggle: () => void;
  accounts: Account[];
  activeAccountId: string;
  onSwitch: (id: string) => void;
  onAddAccount: (name: string) => void;
}) {
  const location = useLocation();

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
      {/* Account Switcher */}
      <AccountSwitcher
        accounts={accounts}
        activeId={activeAccountId}
        onSwitch={onSwitch}
        onAdd={onAddAccount}
        collapsed={collapsed}
      />

      {/* Nav section label */}
      {!collapsed && (
        <div
          className="px-4 pt-4 pb-1"
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sidebar-foreground)",
            opacity: 0.45,
          }}
        >
          Main Menu
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, path }) => {
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
      </nav>

      {/* User profile card */}
      <UserMenu collapsed={collapsed} />
    </aside>
  );
}

// ─── Active Users (multiplayer presence placeholder) ─────────────────────────

function ActiveUsers() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {activeUsers.map((user, i) => (
          <Avatar
            key={user.initials}
            className="border-2 border-white transition-transform hover:scale-110 cursor-pointer"
            style={{
              width: 30,
              height: 30,
              marginLeft: i > 0 ? -8 : 0,
              zIndex: activeUsers.length - i,
              position: "relative",
            }}
            title={user.name}
          >
            <AvatarFallback
              style={{
                backgroundColor: user.color,
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {user.initials}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#10B981", fontWeight: 600 }}>●</span>{" "}
        {activeUsers.length} online
      </span>
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
              Notifications {unread > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#EF4444", backgroundColor: "#FEE2E2", borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{unread}</span>}
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

// ─── Top Header ──────────────────────────────────────────────────────────────

function TopHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
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

      {/* Right: active users + bell */}
      <div className="flex items-center gap-4">
        <ActiveUsers />

        <NotificationBell />
      </div>
    </header>
  );
}

// ─── CompanyLayout ────────────────────────────────────────────────────────────

export function CompanyLayout() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState(getCompanyId());

  // Fetch real accounts for owners; dispatcher/updater have a fixed company_id from login
  useEffect(() => {
    if (user?.role === "owner") {
      api.get<Account[]>("/owner/accounts")
        .then((data) => {
          setAccounts(data);
          // Auto-select: prefer the one already in localStorage, else first
          const saved = getCompanyId();
          const match = data.find((a) => a.id === saved) ?? data[0];
          if (match) {
            setActiveAccountId(match.id);
            setCompanyId(match.id);
          }
        })
        .catch(() => {/* silently ignore — switcher stays empty */});
    } else if (user?.company_id) {
      // dispatcher / updater — already pinned, just make sure it's reflected in state
      setActiveAccountId(user.company_id);
    }
  }, [user]);

  const [switching, setSwitching] = useState(false);

  const switchAccount = (id: string) => {
    if (id === activeAccountId) return;
    setSwitching(true);
    setActiveAccountId(id);
    setCompanyId(id);
    setTimeout(() => setSwitching(false), 800);
  };

  const addAccount = (name: string) => {
    const initials = getInitials(name) || "??";
    const colors   = ["#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"];
    const color    = colors[accounts.length % colors.length];
    const newAcc: Account = { id: `acc-${Date.now()}`, name, initials, color, plan: "Starter" };
    setAccounts((prev) => [...prev, newAcc]);
    switchAccount(newAcc.id);
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "var(--font-sans)", backgroundColor: "var(--background)" }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSwitch={switchAccount}
        onAddAccount={addAccount}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader onToggleSidebar={() => setSidebarCollapsed((v) => !v)} />

        <main
          key={activeAccountId}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "#F9FAFB" }}
        >
          <Outlet />
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

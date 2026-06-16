import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Outlet, NavLink, useLocation } from "react-router";
import {
  LayoutDashboard,
  Trello,
  BarChart2,
  Package,
  Users,
  Truck,
  DollarSign,
  Settings,
  ChevronRight,
  ChevronDown,
  Search,
  Bell,
  Menu,
  Check,
  Plus,
} from "lucide-react";
import { Avatar, AvatarFallback } from "../components/ui/avatar";

// ─── Account types ──────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  initials: string;
  color: string;
  plan: string;
}

const INIT_ACCOUNTS: Account[] = [
  { id: "acc-1", name: "FleetTech Inc.",    initials: "FT", color: "#3B82F6", plan: "Pro"     },
  { id: "acc-2", name: "RapidHaul LLC",     initials: "RH", color: "#10B981", plan: "Starter" },
  { id: "acc-3", name: "Swift Wheels Co.",  initials: "SW", color: "#F59E0B", plan: "Pro"     },
];

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

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

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
  { icon: Settings,        label: "Settings",    path: "settings"    },
];

// ─── Active-user presence data (placeholder) ────────────────────────────────

const activeUsers = [
  { initials: "SR", color: "#8B5CF6", name: "Sofia R." },
  { initials: "MT", color: "#F59E0B", name: "Marcus T." },
  { initials: "JR", color: "#10B981", name: "Jake R." },
];

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
      <div
        className="mx-2 mb-3 rounded-xl flex items-center gap-3"
        style={{
          backgroundColor: "var(--sidebar-accent)",
          padding: collapsed ? "10px 0" : "12px",
          justifyContent: collapsed ? "center" : "flex-start",
          transition: "padding 300ms ease-in-out",
        }}
      >
        <div
          className="rounded-full flex items-center justify-center shrink-0"
          style={{
            width: 34,
            height: 34,
            background: "linear-gradient(135deg, #3B82F6, #6366F1)",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          SS
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#F1F5F9",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Shokhruz S.
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--sidebar-foreground)",
                opacity: 0.65,
              }}
            >
              Admin · Online
            </div>
          </div>
        )}
        {!collapsed && (
          <div
            className="rounded-full shrink-0"
            style={{ width: 8, height: 8, backgroundColor: "#10B981" }}
          />
        )}
      </div>
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

      {/* Global search (cmd+k) */}
      <div className="flex-1 flex justify-center">
        <div
          className="flex items-center gap-2 rounded-lg px-3 transition-all"
          style={{
            width: 320,
            height: 36,
            backgroundColor: "var(--input-background)",
            border: "1px solid var(--border)",
            cursor: "text",
          }}
        >
          <Search size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
              flex: 1,
              userSelect: "none",
            }}
          >
            Search drivers, loads, units…
          </span>
          <kbd
            className="rounded px-1.5 py-0.5 flex items-center gap-0.5"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--muted-foreground)",
              backgroundColor: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: active users + bell */}
      <div className="flex items-center gap-4">
        <ActiveUsers />

        <button
          className="relative flex items-center justify-center rounded-lg transition-colors"
          style={{ width: 34, height: 34, backgroundColor: "var(--muted)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--accent)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--muted)")
          }
        >
          <Bell size={16} style={{ color: "var(--foreground)" }} />
          <span
            className="absolute rounded-full"
            style={{
              top: 6,
              right: 6,
              width: 7,
              height: 7,
              backgroundColor: "#EF4444",
              border: "1.5px solid #fff",
              boxShadow: "0 0 0 2px #fff",
            }}
          />
        </button>
      </div>
    </header>
  );
}

// ─── CompanyLayout ────────────────────────────────────────────────────────────

export function CompanyLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accounts, setAccounts]         = useState<Account[]>(INIT_ACCOUNTS);
  const [activeAccountId, setActiveAccountId] = useState(INIT_ACCOUNTS[0].id);

  const addAccount = (name: string) => {
    const initials = getInitials(name) || "??";
    const colors   = ["#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"];
    const color    = colors[accounts.length % colors.length];
    const newAcc: Account = { id: `acc-${Date.now()}`, name, initials, color, plan: "Starter" };
    setAccounts((prev) => [...prev, newAcc]);
    setActiveAccountId(newAcc.id);
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
        onSwitch={setActiveAccountId}
        onAddAccount={addAccount}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader onToggleSidebar={() => setSidebarCollapsed((v) => !v)} />

        <main
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "#F9FAFB" }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

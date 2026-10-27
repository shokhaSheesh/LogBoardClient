import type { AuthUser } from "./auth";
import { FUEL_ENABLED } from "./features";

// Maps each workspace page to the company-plane permission module that gates it.
export interface PagePerm {
  path: string;
  module: string;
  // Page opens if the user holds `read` on ANY of these modules (used by Settings, whose
  // tabs are each gated on their own key — users, teams, work_week, …).
  anyModule?: string[];
}

// The company-plane modules that Settings manages, one per tab — the page shows if the user
// can read any of them (and each tab is gated individually inside SettingsPage).
export const SETTINGS_MODULES = ["users", "teams", "roles", "work_week", "fuel_settings", "eld", "kpi_table"]
  .filter((m) => FUEL_ENABLED || m !== "fuel_settings");

export const PAGE_PERMS: PagePerm[] = [
  // In the sidebar's order: the first one a user can open is where they land.
  { path: "dashboard",  module: "dashboard"  },
  { path: "board",      module: "board"      },
  { path: "loads",      module: "loads"      },
  { path: "drivers",    module: "drivers"    },
  { path: "equipments", module: "equipments" },
  { path: "gross",      module: "gross"      },
  { path: "payouts",    module: "payouts"    },
  { path: "compensations", module: "compensations" },
  // Runs on /company/* now, gated on permission keys — not owner-only anymore.
  { path: "settings",   module: "users", anyModule: SETTINGS_MODULES },
];

// True if the user holds `<module>.<action>` for the active company. Owners carry
// every company key and admins bypass company gates entirely, so both are allowed
// through without inspecting the key list (which may be empty before a company is
// picked).
export function hasPerm(user: AuthUser | null, module: string, action: string = "read"): boolean {
  if (!user) return false;
  if (user.role === "owner" || user.kind === "admin") return true;
  const perms = user.permissions ?? [];
  if (perms.includes(`${module}.${action}`)) return true;
  // Equipments is exposed as one module on the frontend but may be split into
  // trucks/trailers on the permission catalog — accept either.
  if (module === "equipments") {
    return perms.includes(`trucks.${action}`) || perms.includes(`trailers.${action}`);
  }
  return false;
}

// Whether the user may open a given workspace page (path is the segment after
// /workspace/, e.g. "loads" or "settings/roles").
export function canAccessPage(user: AuthUser | null, path: string): boolean {
  const seg = path.split("/")[0];
  const def = PAGE_PERMS.find((p) => p.path === seg);
  if (!def) return true; // unknown page — don't block
  if (def.anyModule) return def.anyModule.some((m) => hasPerm(user, m));
  return hasPerm(user, def.module);
}

// The first page (in nav order) the user can actually open — used for the index
// redirect and as the fallback when they land on a page they can't access.
// null when they can open none — the caller then says so instead of redirecting in a circle.
export function firstAccessiblePath(user: AuthUser | null): string | null {
  return PAGE_PERMS.find((p) => canAccessPage(user, p.path))?.path ?? null;
}

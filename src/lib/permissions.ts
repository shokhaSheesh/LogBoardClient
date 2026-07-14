import type { AuthUser } from "./auth";

// Maps each workspace page to the company-plane permission module that gates it.
// `ownerOnly` pages live under /owner/* on the backend and are reachable only by
// the carrier owner (dispatchers/updaters get 403 there), so they're gated on the
// operational role rather than a permission key.
export interface PagePerm {
  path: string;
  module: string;
  ownerOnly?: boolean;
}

export const PAGE_PERMS: PagePerm[] = [
  { path: "dashboard",  module: "dashboard"  },
  { path: "board",      module: "board"      },
  { path: "gross",      module: "gross"      },
  { path: "loads",      module: "loads"      },
  { path: "drivers",    module: "drivers"    },
  { path: "equipments", module: "equipments" },
  { path: "payouts",    module: "payouts"    },
  { path: "billing",    module: "billing",  ownerOnly: true },
  { path: "settings",   module: "settings", ownerOnly: true },
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
  if (def.ownerOnly) return user?.role === "owner";
  return hasPerm(user, def.module);
}

// The first page (in nav order) the user can actually open — used for the index
// redirect and as the fallback when they land on a page they can't access.
export function firstAccessiblePath(user: AuthUser | null): string {
  const found = PAGE_PERMS.find((p) => canAccessPage(user, p.path));
  return found ? found.path : "dashboard";
}

// Whether a page is served entirely by /owner/* endpoints. Those sit OUTSIDE the plan
// gate — the backend keeps them reachable precisely so an unentitled company can still
// record a subscription — so they must stay open when the rest of the workspace is
// locked out. Everything else is a tenant route and dies with the gate.
export function isOwnerPlanePage(path: string): boolean {
  const seg = path.split("/")[0];
  return PAGE_PERMS.find((p) => p.path === seg)?.ownerOnly ?? false;
}

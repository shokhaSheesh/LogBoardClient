import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { CompanyLayout } from "./layouts/CompanyLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BoardPage } from "./pages/BoardPage";
import { GrossPage } from "./pages/GrossPage";
import { LoadsPage } from "./pages/LoadsPage";
import { LoadFormPage } from "./components/LoadsPage";
import { DriversPage } from "./pages/DriversPage";
import { EquipmentsPage } from "./pages/EquipmentsPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { CompensationsPage } from "./pages/CompensationsPage";
import { ShortcutsPage } from "./pages/ShortcutsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useAuth } from "./lib/auth";
import { canAccessPage, firstAccessiblePath } from "./lib/permissions";
import { KpiPage } from "./pages/KpiPage";

// Blocks a page the current user can't access, bouncing them to the first page
// they can. Permissions are per-company, so this re-evaluates whenever the user
// (and their resolved permission set) changes.
function PermGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!canAccessPage(user, path)) {
    const first = firstAccessiblePath(user);
    return first ? <Navigate to={`/workspace/${first}`} replace /> : <NoAccess />;
  }
  return <>{children}</>;
}

// A user whose role opens no page at all: say so, rather than bounce between redirects.
function NoAccess() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "var(--font-sans)" }}>
      <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>No pages to show yet</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted-foreground)" }}>Your role doesn't open any page. Ask the company owner to give your role access.</div>
      </div>
    </div>
  );
}

// Sends the user to the first page they're allowed to open (Dashboard for most,
// but e.g. an updater with only board access lands on Board).
function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  const first = firstAccessiblePath(user);
  return first ? <Navigate to={`/workspace/${first}`} replace /> : <NoAccess />;
}

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--background)",
          color: "var(--muted-foreground)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/workspace" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/workspace",
        element: <CompanyLayout />,
        children: [
          { index: true, element: <IndexRedirect /> },
          { path: "dashboard", element: <PermGuard path="dashboard"><DashboardPage /></PermGuard> },
          { path: "board", element: <PermGuard path="board"><BoardPage /></PermGuard> },
          { path: "gross", element: <PermGuard path="gross"><GrossPage /></PermGuard> },
          { path: "loads", element: <PermGuard path="loads"><LoadsPage /></PermGuard> },
          // Creating and editing a load are pages of their own (they replaced a dialog).
          { path: "loads/new", element: <PermGuard path="loads"><LoadFormPage /></PermGuard> },
          { path: "loads/:id/edit", element: <PermGuard path="loads"><LoadFormPage /></PermGuard> },
          { path: "drivers", element: <PermGuard path="drivers"><DriversPage /></PermGuard> },
          { path: "equipments", element: <PermGuard path="equipments"><EquipmentsPage /></PermGuard> },
          { path: "payouts", element: <PermGuard path="payouts"><PayoutsPage /></PermGuard> },
          { path: "compensations", element: <PermGuard path="compensations"><CompensationsPage /></PermGuard> },
          { path: "shortcuts", element: <ShortcutsPage /> },
          { path: "payouts/kpi", element: <PermGuard path="payouts"><KpiPage /></PermGuard> },
          { path: "settings/*", element: <PermGuard path="settings"><SettingsPage /></PermGuard> },
        ],
      },
    ],
  },
  {
    path: "/",
    element: <Navigate to="/workspace" replace />,
  },
]);

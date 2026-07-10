import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { CompanyLayout } from "./layouts/CompanyLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BoardPage } from "./pages/BoardPage";
import { GrossPage } from "./pages/GrossPage";
import { LoadsPage } from "./pages/LoadsPage";
import { DriversPage } from "./pages/DriversPage";
import { EquipmentsPage } from "./pages/EquipmentsPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BillingPage } from "./pages/BillingPage";
import { useAuth } from "./lib/auth";
import { canAccessPage, firstAccessiblePath } from "./lib/permissions";

// Blocks a page the current user can't access, bouncing them to the first page
// they can. Permissions are per-company, so this re-evaluates whenever the user
// (and their resolved permission set) changes.
function PermGuard({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!canAccessPage(user, path)) {
    return <Navigate to={`/workspace/${firstAccessiblePath(user)}`} replace />;
  }
  return <>{children}</>;
}

// Sends the user to the first page they're allowed to open (Dashboard for most,
// but e.g. an updater with only board access lands on Board).
function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={`/workspace/${firstAccessiblePath(user)}`} replace />;
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
          { path: "drivers", element: <PermGuard path="drivers"><DriversPage /></PermGuard> },
          { path: "equipments", element: <PermGuard path="equipments"><EquipmentsPage /></PermGuard> },
          { path: "payouts", element: <PermGuard path="payouts"><PayoutsPage /></PermGuard> },
          { path: "billing", element: <PermGuard path="billing"><BillingPage /></PermGuard> },
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

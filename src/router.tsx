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
  if (user) return <Navigate to="/workspace/dashboard" replace />;
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
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "board", element: <BoardPage /> },
          { path: "gross", element: <GrossPage /> },
          { path: "loads", element: <LoadsPage /> },
          { path: "drivers", element: <DriversPage /> },
          { path: "equipments", element: <EquipmentsPage /> },
          { path: "payouts", element: <PayoutsPage /> },
          { path: "billing", element: <BillingPage /> },
          { path: "settings/*", element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: "/",
    element: <Navigate to="/workspace/dashboard" replace />,
  },
]);

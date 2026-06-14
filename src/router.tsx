import { createBrowserRouter, Navigate } from "react-router";
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

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
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
      { path: "settings/*", element: <SettingsPage /> },
    ],
  },
  {
    path: "/",
    element: <Navigate to="/workspace/board" replace />,
  },
]);

import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { EntitlementProvider } from "./lib/entitlement";
import { AppToaster } from "./components/feedback";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <EntitlementProvider>
        <RouterProvider router={router} />
        <AppToaster />
      </EntitlementProvider>
    </AuthProvider>
  </ThemeProvider>
);

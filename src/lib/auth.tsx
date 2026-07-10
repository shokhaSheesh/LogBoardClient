import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, clearToken, setToken, setCompanyId } from "./api";

export interface AuthUser {
  id: string;
  kind: string;
  role: "owner" | "dispatcher" | "updater";
  login: string;
  email: string;
  full_name: string;
  company_id: string;
  // The company the caller is acting as. Omitted (never null) when there's none to
  // resolve — an admin, or an owner who named no company / one they don't own.
  // `mc` is only present once the backend includes it; everything else always is.
  company?: {
    id: string;
    name: string;
    initials: string;
    color: string;
    plan: string;          // "" when the company has no plan
    week_start_day: number; // 0=Sunday … 6=Saturday
    mc?: string;
  };
  must_change_password: boolean;
  // Effective permission keys ("<module>.<action>") for the active company.
  // Resolved fresh by GET /auth/me; [] for an owner who hasn't picked a company yet.
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  // Re-fetch /auth/me — permissions are per-company, so owners must refresh after
  // switching the active company.
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: AuthUser }>(
      "/auth/login",
      { email, password }
    );
    setToken(data.token);

    // For owners, company_id is "" — they pick a company via the account switcher.
    // For dispatcher/updater, persist their company immediately so the very next
    // /auth/me carries their per-company permission set.
    if (data.user.company_id) {
      setCompanyId(data.user.company_id);
    }

    // The login payload has no permissions — pull the effective set from /auth/me
    // (now that X-Company-ID is set for non-owners). Fall back to the login user.
    try {
      const me = await api.get<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(data.user);
    }

    return { mustChangePassword: data.user.must_change_password };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      // ignore — keep the current user on a transient failure
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — token may already be expired
    }
    clearToken();
    localStorage.removeItem("active_company_id");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

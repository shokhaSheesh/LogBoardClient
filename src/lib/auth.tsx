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
  must_change_password: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
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
    setUser(data.user);

    // For owners, company_id is "" — they pick a company via the account switcher.
    // For dispatcher/updater, persist their company immediately.
    if (data.user.company_id) {
      setCompanyId(data.user.company_id);
    }

    return { mustChangePassword: data.user.must_change_password };
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
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

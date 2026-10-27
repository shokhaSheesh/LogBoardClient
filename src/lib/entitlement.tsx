import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onEntitlementError, type EntitlementCode } from "./api";

// The company gate, as the UI sees it.
//
// The backend cuts a board user off from every tenant route unless their company is
// Active. There is no endpoint to ask "is my company open?", so we learn it the only way
// available: a request comes back 403 with the reason, and we hold on to it. Reads 403 too,
// so the workspace is dead and we show a full-page notice instead of a shell full of
// failed widgets.

export interface EntitlementCopy {
  title: string;
  body: string;
}

const COPY: Record<EntitlementCode, EntitlementCopy> = {
  company_suspended: {
    title: "This company is suspended",
    body: "An administrator has suspended the account, so the board isn't available. Get in touch with them to restore it.",
  },
  company_unavailable: {
    title: "This company isn't available",
    body: "The board can't reach this company right now. Try again in a moment, and if it keeps happening, get in touch with your administrator.",
  },
};

interface EntitlementState {
  /** Set once the company's requests are refused — the workspace can't be used at all. */
  blocked: EntitlementCode | null;
  copy: EntitlementCopy | null;
  /** Forget the current state — call this when switching company. */
  clear: () => void;
}

const Ctx = createContext<EntitlementState>({ blocked: null, copy: null, clear: () => {} });

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<EntitlementCode | null>(null);

  useEffect(() => onEntitlementError((c) => setCode(c)), []);

  const value = useMemo<EntitlementState>(() => ({
    blocked: code,
    copy:    code ? COPY[code] : null,
    clear:   () => setCode(null),
  }), [code]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement(): EntitlementState {
  return useContext(Ctx);
}

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onEntitlementError, type EntitlementCode } from "./api";

// The plan gate, as the UI sees it.
//
// The backend cuts a board user off from every tenant route unless their company is
// entitled — it has a plan, status Active, and an unexpired period. There is no
// endpoint a dispatcher can call to ask "am I entitled?" (billing lives under
// /owner/*, which they can't reach), so we learn it the only way available: a request
// comes back 403 with the reason, and we hold on to it.
//
// Three of the four are total — reads 403 too, so the workspace is dead and we show a
// full-page notice instead of a shell full of failed widgets. grace_read_only is the
// gentle one: the board still reads for 7 days after the last subscription lapsed, and
// only writes are refused, so it's a banner and nothing more.

export interface EntitlementCopy {
  title: string;
  body: string;
}

const COPY: Record<EntitlementCode, EntitlementCopy> = {
  plan_required: {
    title: "This company has no plan",
    body: "The workspace is locked until a plan is recorded. Ask your administrator to set one up.",
  },
  company_suspended: {
    title: "This company is suspended",
    body: "An administrator has suspended the account, so the board isn't available. Get in touch with them to restore it.",
  },
  subscription_expired: {
    title: "The subscription has expired",
    body: "The plan period has ended and the board is locked until it's renewed. Ask your administrator to renew it.",
  },
  grace_read_only: {
    title: "Subscription lapsed — the board is read-only",
    body: "You can still see everything, but changes won't save until the subscription is renewed.",
  },
};

interface EntitlementState {
  /** Set when reads are blocked too — the workspace can't be used at all. */
  blocked: EntitlementCode | null;
  /** True during the 7-day grace window: the board reads, but writes are refused. */
  readOnly: boolean;
  copy: EntitlementCopy | null;
  /** Forget the current state — call this when switching company. */
  clear: () => void;
}

const Ctx = createContext<EntitlementState>({
  blocked: null, readOnly: false, copy: null, clear: () => {},
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<EntitlementCode | null>(null);

  useEffect(() => onEntitlementError((c) => {
    // A hard block outranks the grace window: if reads are 403ing too, saying
    // "read-only" would be a lie. Otherwise the newest verdict wins.
    setCode((prev) => (prev && prev !== "grace_read_only" ? prev : c));
  }), []);

  const value = useMemo<EntitlementState>(() => ({
    blocked:  code && code !== "grace_read_only" ? code : null,
    readOnly: code === "grace_read_only",
    copy:     code ? COPY[code] : null,
    clear:    () => setCode(null),
  }), [code]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement(): EntitlementState {
  return useContext(Ctx);
}

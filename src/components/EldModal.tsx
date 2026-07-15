import { useState, useEffect, useCallback } from "react";
import { X, RefreshCw, Link2, Unlink, AlertCircle, Check, Truck, Phone } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { AsyncSearchableSelect } from "./AsyncSelect";
import { driverDisplayName } from "../lib/driverName";

// One entry from GET /eld/drivers: a driver on the provider's roster, and how (if at all)
// it maps to a board driver.
interface EldRosterEntry {
  remote: { id: string; name: string; phone?: string; license_no?: string; license_state?: string };
  driver_id?: string;        // present when already linked
  driver_name?: string;
  suggested_driver_id?: string;  // offered, NOT linked
  suggested_by?: string;         // "phone" | "name"
}

interface SyncResult { drivers: number; unlinked: number; synced_at: string }

// Turn the ELD error codes into something a human can act on. These aren't the user doing
// anything wrong — they're states of the integration — so each says who fixes it.
export function eldErrorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : undefined;
  switch (code) {
    case "not_configured":         return "ELD isn't set up on the server yet. This is a platform setting — ask your administrator.";
    case "eld_not_connected":      return "No ELD is connected for this company. An owner connects one in company settings before drivers can be linked.";
    case "unknown_provider":       return "That ELD provider doesn't have an integration yet.";
    case "invalid_eld_credentials":return "The ELD provider rejected the saved key. It needs to be reconnected with a valid one.";
    case "eld_unavailable":        return "The ELD provider is temporarily unavailable. This is on their end — try again shortly.";
    default:                       return e instanceof Error ? e.message : "Something went wrong talking to the ELD.";
  }
}

export function EldModal({ onClose, onLinked, canManage = true }: { onClose: () => void; onLinked?: () => void; canManage?: boolean }) {
  const [roster, setRoster]   = useState<EldRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null); // remote id being linked/unlinked
  // For an unlinked remote driver, which board driver the user has picked to link to.
  const [pick, setPick] = useState<Record<string, { id: string; label: string }>>({});

  const loadRoster = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.get<EldRosterEntry[]>("/eld/drivers");
      setRoster(data ?? []);
      // Pre-fill each unlinked row's picker with the server's suggested match, resolving
      // its name so the select reads as a person, not a bare id. The user still has to
      // confirm — a suggestion is never a link (a wrong link mis-attributes a truck).
      const suggestions = (data ?? []).filter((e) => !e.driver_id && e.suggested_driver_id);
      const resolved = await Promise.all(suggestions.map(async (e) => {
        try {
          const d = await api.get<any>(`/drivers/${e.suggested_driver_id}`);
          return { remoteId: e.remote.id, id: e.suggested_driver_id!, label: driverDisplayName(d) };
        } catch {
          return { remoteId: e.remote.id, id: e.suggested_driver_id!, label: "" };
        }
      }));
      const seed: Record<string, { id: string; label: string }> = {};
      for (const r of resolved) seed[r.remoteId] = { id: r.id, label: r.label };
      setPick(seed);
    } catch (e) {
      setError(eldErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const sync = async () => {
    setSyncing(true); setError(null);
    try {
      const res = await api.post<SyncResult>("/eld/sync");
      setLastSync(res);
      await loadRoster(); // linked/unlinked counts may have shifted
    } catch (e) {
      setError(eldErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const link = async (remoteId: string, driverId: string) => {
    setBusyId(remoteId); setError(null);
    try {
      await api.post("/eld/drivers/link", { driver_id: driverId, eld_driver_id: remoteId });
      await loadRoster();
      onLinked?.();
    } catch (e) {
      setError(eldErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const unlink = async (remoteId: string, driverId: string) => {
    setBusyId(remoteId); setError(null);
    try {
      await api.delete(`/eld/drivers/${driverId}/link`);
      await loadRoster();
      onLinked?.();
    } catch (e) {
      setError(eldErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const linkedCount = roster.filter((e) => e.driver_id).length;

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 620, maxHeight: "88vh", boxShadow: "0 20px 60px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(34,211,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Truck size={15} color="#22D3EE" />
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>ELD drivers</div>
              {!loading && !error && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                  {linkedCount} of {roster.length} linked
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canManage && (
              <button onClick={sync} disabled={syncing || loading}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: syncing || loading ? "default" : "pointer", opacity: syncing || loading ? 0.6 : 1 }}>
                <RefreshCw size={13} style={{ animation: syncing ? "spin 0.7s linear infinite" : undefined }} /> {syncing ? "Syncing…" : "Sync now"}
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}><X size={16} /></button>
          </div>
        </div>

        {/* Last sync line */}
        {lastSync && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", flexShrink: 0 }}>
            Synced — {lastSync.drivers} driver{lastSync.drivers !== 1 ? "s" : ""} updated
            {lastSync.unlinked > 0 && <>, <span style={{ color: "#F59E0B" }}>{lastSync.unlinked} truck{lastSync.unlinked !== 1 ? "s" : ""} reporting for nobody</span></>}.
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 8, marginBottom: 12 }}>
              <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#EF4444", lineHeight: 1.5 }}>{error}</div>
            </div>
          )}

          {loading ? (
            <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading roster…</div>
          ) : roster.length === 0 && !error ? (
            <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
              No drivers on the ELD roster yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roster.map((e) => {
                const linked = !!e.driver_id;
                const busy = busyId === e.remote.id;
                const picked = pick[e.remote.id];
                return (
                  <div key={e.remote.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, backgroundColor: "var(--background)" }}>
                    {/* Remote driver */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.remote.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                        {e.remote.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={10} /> {e.remote.phone}</span>}
                        {e.remote.license_no && <span>{e.remote.license_state ? `${e.remote.license_state} ` : ""}{e.remote.license_no}</span>}
                      </div>
                    </div>

                    {/* Link state / action */}
                    {linked ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#10B981", backgroundColor: "rgba(16,185,129,0.12)", borderRadius: 6, padding: "3px 9px" }}>
                          <Check size={12} /> {e.driver_name || "Linked"}
                        </span>
                        {canManage && (
                          <button onClick={() => unlink(e.remote.id, e.driver_id!)} disabled={busy} title="Unlink"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)", fontSize: 12, padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--muted-foreground)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                            <Unlink size={12} /> {busy ? "…" : "Unlink"}
                          </button>
                        )}
                      </div>
                    ) : !canManage ? (
                      <span style={{ flexShrink: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>Not linked</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, width: 300 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <AsyncSearchableSelect
                            value={picked?.id ?? ""}
                            valueLabel={picked?.label ?? ""}
                            placeholder="Link to driver…"
                            fetchPage={async (q, p) => {
                              const { items, total } = await api.getList<any>("/drivers", { q: q || undefined, page: p, page_size: 20 });
                              return { items: (items ?? []).map((d: any) => ({ value: d.id, label: driverDisplayName(d) })), total };
                            }}
                            onChange={(id, label) => setPick((prev) => ({ ...prev, [e.remote.id]: { id, label } }))}
                          />
                          {e.suggested_driver_id && e.suggested_by && (
                            <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)", marginTop: 3 }}>
                              Suggested by {e.suggested_by}
                            </div>
                          )}
                        </div>
                        <button onClick={() => picked?.id && link(e.remote.id, picked.id)} disabled={busy || !picked?.id}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "none", backgroundColor: picked?.id && !busy ? "var(--primary)" : "var(--muted)", color: picked?.id && !busy ? "#fff" : "var(--muted-foreground)", cursor: picked?.id && !busy ? "pointer" : "default", flexShrink: 0 }}>
                          <Link2 size={12} /> {busy ? "…" : "Link"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

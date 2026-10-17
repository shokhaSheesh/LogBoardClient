import { useEffect, useState } from "react";
import { Home, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { fmtDate, fmtDateRange } from "../lib/dates";
import { DatePicker } from "./DatePicker";
import { friendlyError, notify } from "./feedback";

// A driver's home time: the stretches they spend at home, from one day to another, kept as a
// history. Dispatchers put one in when a driver goes home, so everyone can see when they are
// away and when they are back. The days are a record only — the driver's status is still set
// by hand.

export interface HomePeriod { id: string; startDate: string; endDate: string }

// Said whenever a home period is added, changed or removed, so a list showing drivers' home
// time (the Drivers table, behind an open driver form) can read it again.
export const HOME_CHANGED = "brelo:home-periods-changed";
const changed = () => window.dispatchEvent(new Event(HOME_CHANGED));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toHome = (p: any): HomePeriod | undefined =>
  p?.id ? { id: p.id, startDate: p.start_date ?? "", endDate: p.end_date ?? "" } : undefined;

// Today as a calendar day, the way the dates are written (YYYY-MM-DD).
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isNow = (p: HomePeriod) => p.startDate <= todayIso() && todayIso() <= p.endDate;
// Inclusive: 20–27 is eight days at home.
const daysOf = (p: HomePeriod) => Math.round((Date.parse(p.endDate) - Date.parse(p.startDate)) / 86400000) + 1;

const pill = (now: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "2px 7px",
  color: now ? "var(--primary)" : "var(--foreground)", backgroundColor: now ? "var(--secondary)" : "var(--muted)",
});

/** The table cell: the period on today or the next one, with a mark when it is on now. */
export function HomeCell({ home }: { home?: HomePeriod }) {
  if (!home) return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  const now = isNow(home);
  return (
    <span style={pill(now)} title={now ? "At home now" : "Going home"}>
      <Home size={11} /> {fmtDateRange(home.startDate, home.endDate)}
    </span>
  );
}

const card: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 };
const cap: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 500, color: "var(--muted-foreground)" };
const note: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 };
const btn = (primary: boolean, busy = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8,
  fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  border: primary ? "none" : "1px solid var(--border)", backgroundColor: primary ? "var(--primary)" : "var(--card)", color: primary ? "var(--primary-foreground)" : "var(--foreground)",
});
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: "none", background: "none", cursor: "pointer", color: "var(--muted-foreground)" };

/** The card on a driver's page: the whole history, newest first, with add, change and remove. */
export function DriverHomePeriods({ driverId }: { driverId: string }) {
  const { user } = useAuth();
  const canChange = hasPerm(user, "drivers", "update");
  const [periods, setPeriods] = useState<HomePeriod[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; from: string; until: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let gone = false;
    setLoadError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(`/drivers/${driverId}/home-periods`)
      .then((list) => { if (!gone) setPeriods((list ?? []).map(toHome).filter((p): p is HomePeriod => !!p)); })
      .catch((e) => { if (!gone) { setPeriods(null); setLoadError(friendlyError(e, "Couldn't load the home time.")); } });
    return () => { gone = true; };
  }, [driverId, attempt]);

  // A failed read says so, rather than leaving the driver looking as if it had no home time.
  if (!periods) {
    if (!loadError) return null;
    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Home size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={cap}>Home time</div>
            <div role="alert" style={{ ...note, color: "var(--destructive)" }}>{loadError}</div>
          </div>
          <button type="button" style={btn(false)} onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }

  const save = async () => {
    if (!editing) return;
    if (!editing.from || !editing.until) { setError("Pick both days."); return; }
    if (editing.until < editing.from) { setError("The last day can't be before the first."); return; }
    setBusy(true); setError("");
    try {
      const body = { start_date: editing.from, end_date: editing.until };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = toHome(editing.id
        ? await api.put<any>(`/drivers/${driverId}/home-periods/${editing.id}`, body)
        : await api.post<any>(`/drivers/${driverId}/home-periods`, body));
      if (saved) setPeriods((ps) => [saved, ...(ps ?? []).filter((p) => p.id !== saved.id)].sort((a, b) => b.startDate.localeCompare(a.startDate)));
      setEditing(null);
      changed();
      notify.success(editing.id ? "Home time changed" : "Home time added");
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the home time."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/drivers/${driverId}/home-periods/${id}`);
      setPeriods((ps) => (ps ?? []).filter((p) => p.id !== id));
      changed();
      notify.success("Home time removed");
    } catch (e) {
      notify.error(friendlyError(e, "Couldn't remove the home time."));
    } finally {
      setBusy(false); setRemoving(null);
    }
  };

  const form = editing && (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 10, backgroundColor: "var(--muted)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={cap}>From</span>
          <DatePicker label="Home from" value={editing.from} onChange={(from) => { setError(""); setEditing({ ...editing, from, until: editing.until && editing.until < from ? from : editing.until }); }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={cap}>Until</span>
          <DatePicker label="Home until" value={editing.until} min={editing.from || undefined} onChange={(until) => { setError(""); setEditing({ ...editing, until }); }} />
        </div>
      </div>
      {error && <div role="alert" style={{ ...note, color: "var(--destructive)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={btn(false)} onClick={() => { setEditing(null); setError(""); }} disabled={busy}>Cancel</button>
        <button type="button" style={btn(true, busy)} onClick={save} disabled={busy}>{editing.id ? "Save" : "Add"}</button>
      </div>
    </div>
  );

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Home size={15} style={{ color: periods.some(isNow) ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={cap}>Home time</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>
            {periods.find(isNow) ? `Home until ${fmtDate(periods.find(isNow)!.endDate)}` : periods.length ? `Went home ${periods.length} ${periods.length === 1 ? "time" : "times"}` : "None yet"}
          </div>
        </div>
        {canChange && !editing && (
          <button type="button" style={btn(false)} onClick={() => setEditing({ id: "", from: "", until: "" })}><Plus size={13} /> Add</button>
        )}
      </div>

      {editing && !editing.id && form}

      {periods.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {periods.map((p) => (
            editing?.id === p.id ? <div key={p.id}>{form}</div> : (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 0, flex: 1 }}>
                  <span style={pill(isNow(p))}>{fmtDateRange(p.startDate, p.endDate)}</span>
                  <span style={{ ...note, fontSize: 11.5 }}>{daysOf(p)} {daysOf(p) === 1 ? "day" : "days"}{isNow(p) ? " · at home now" : p.startDate > todayIso() ? " · coming up" : ""}</span>
                </div>
                {canChange && (removing === p.id ? (
                  <>
                    <button type="button" style={btn(false)} onClick={() => setRemoving(null)} disabled={busy}>Keep</button>
                    <button type="button" style={{ ...btn(true, busy), backgroundColor: "var(--destructive)" }} onClick={() => remove(p.id)} disabled={busy}>Remove</button>
                  </>
                ) : (
                  <>
                    <button type="button" style={iconBtn} aria-label={`Change ${fmtDateRange(p.startDate, p.endDate)}`} onClick={() => { setError(""); setEditing({ id: p.id, from: p.startDate, until: p.endDate }); }}><Pencil size={13} /></button>
                    <button type="button" style={iconBtn} aria-label={`Remove ${fmtDateRange(p.startDate, p.endDate)}`} onClick={() => setRemoving(p.id)}><Trash2 size={13} /></button>
                  </>
                ))}
              </div>
            )
          ))}
        </div>
      )}
      {periods.length === 0 && !editing && <div style={note}>When this driver goes home, add the days here so everyone can see when they're back.</div>}
    </div>
  );
}

/** On a new driver, before it exists: an optional first home period, saved after the driver is. */
export function NewHomePeriod({ from, until, onChange }: { from: string; until: string; onChange: (from: string, until: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={cap}>Home from</span>
        <DatePicker label="Home from" value={from} onChange={(f) => onChange(f, until && until < f ? f : until)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={cap}>Home until</span>
        <DatePicker label="Home until" value={until} min={from || undefined} onChange={(u) => onChange(from, u)} />
      </div>
    </div>
  );
}

/**
 * Saves the home days typed into a driver's form. `prev` is the period the form opened with
 * (the driver's current or next one): changed days change it, emptied days remove it, and
 * days on a driver that had none add a new period. Both days or neither: half a period is
 * not one, and the form refuses that before it gets here.
 */
export async function saveHomeFromForm(driverId: string, prev: HomePeriod | undefined, from?: string, until?: string): Promise<boolean> {
  if (!from || !until) {
    if (!prev) return false;
    await api.delete(`/drivers/${driverId}/home-periods/${prev.id}`);
  } else if (prev) {
    if (prev.startDate === from && prev.endDate === until) return false;
    await api.put(`/drivers/${driverId}/home-periods/${prev.id}`, { start_date: from, end_date: until });
  } else {
    await api.post(`/drivers/${driverId}/home-periods`, { start_date: from, end_date: until });
  }
  changed();
  return true;
}

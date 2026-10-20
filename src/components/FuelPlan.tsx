import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { AlertCircle, ChevronDown, Fuel, RefreshCw, Send } from "lucide-react";
import { api, ApiError, isForbidden } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { fmtDateTime } from "../lib/dates";
import { useLayer } from "../lib/layers";
import { friendlyError, notify } from "./feedback";

// ─── Wire shapes (the backend's fuelplan module, ADR 0037) ────────────────────

// A load's latest plan as the load list carries it: enough to say "ready, 2 stops" without
// reading the plan. Outdated: the load (or the driver's truck) changed after it was made.
export interface FuelPlanSummary {
  id: string;
  computed_at: string;
  approx: boolean;
  stops: number;
  gallons: number;
  cost: number;
  savings: number | null;
  deadhead_mi: number;
  loaded_mi: number;
  next_stop: { name: string; state: string; route_mile: number; buy_gal: number; price: number; lat: number; lng: number } | null;
  outdated: boolean;
}

interface Alternative {
  name: string; address: string; city: string; state: string;
  route_mile: number; off_route_mi: number; pump_price: number; effective_price: number; delta: number;
}

interface PlanStop {
  seq: number; name: string; address: string; city: string; state: string;
  location: { lat: number; lng: number };
  route_mile: number; off_route_mi: number; arrive_gal: number; buy_gal: number;
  pump_price: number; ifta_rate: number; effective_price: number;
  price_source: "station" | "regional_average"; price_age_h: number | null; stale_price: boolean;
  cost: number; alternatives: Alternative[] | null;
}

interface Plan {
  id: string;
  truck_unit: string;
  approx: boolean;
  catalog_partial: boolean;
  notes: string[] | null;
  route_miles: number;
  deadhead_mi: number;
  loaded_mi: number;
  route_from: "eld" | "stop";
  assumptions: {
    tank_gal: number; mpg: number; reserve_pct: number; min_buy_gal: number; max_off_route_mi: number;
    reserve_gal: number; start_fuel_gal: number; start_fuel_pct: number;
    start_fuel_from: "eld" | "request" | "assumed"; position_at: string | null;
    ifta_mode: "net" | "pump"; ifta_quarter: string;
  };
  stops: PlanStop[] | null;
  end_fuel_gal: number;
  totals: { gallons: number; cost: number; net_cost: number; stops: number; detour_mi: number; savings: number | null };
  candidates: number;
  created_at: string;
}

// The places the route bar names, read from the load's own stops.
export interface FuelRoutePlaces { next: string; pickup: string | null; delivery: string }

// ─── Formatting ───────────────────────────────────────────────────────────────

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// A pump price as the sign shows it: to the cent, or to the tenth of a cent when the station
// posts one — "$4.10", "$3.899". The Telegram message writes it the same way.
const price = (n: number) => { const t = n.toFixed(3); return `$${t.endsWith("0") ? n.toFixed(2) : t}`; };
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
// Fuel to the tenth, as the plan works it out and the money is counted from: "166.5", "60".
const gal = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const mapsLink = (s: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;

// How old a posted price is, in words; old is a day or more.
function priceAge(h: number | null): { text: string; old: boolean } {
  if (h == null) return { text: "", old: false };
  if (h < 1) return { text: "posted within the hour", old: false };
  if (h < 24) return { text: `posted ${Math.round(h)}h ago`, old: false };
  const d = Math.round(h / 24);
  return { text: `${d} day${d === 1 ? "" : "s"} old`, old: true };
}

// ─── Errors, said plainly ─────────────────────────────────────────────────────
//
// The server's sentence is already written for the dispatcher; this adds a title, how serious
// it is, and the one thing to do about it.

type Tone = "stop" | "wait" | "none";
type Fix = "retry" | "truck" | "edit";
const PROBLEMS: Record<string, { title: string; tone: Tone; fix?: Fix }> = {
  no_truck:              { title: "No truck",                       tone: "stop", fix: "truck" },
  cant_reach_pickup:     { title: "Can't reach the pickup",         tone: "stop" },
  no_fuel_in_range:      { title: "No truck stop in range",         tone: "stop", fix: "retry" },
  catalog_not_ready:     { title: "Truck-stop map still loading",   tone: "wait", fix: "retry" },
  stop_missing_location: { title: "A stop has no map location",     tone: "wait", fix: "edit" },
  load_finished:         { title: "Load is finished",               tone: "none" },
  no_route:              { title: "Nothing left to drive",          tone: "none" },
  router_failed:         { title: "The route couldn't be drawn",    tone: "wait", fix: "retry" },
  fuel_prices_failed:    { title: "Fuel prices couldn't be read",   tone: "stop", fix: "retry" },
  not_configured:        { title: "Fuel plans aren't set up yet",   tone: "none" },
};
const TONE_COLOR: Record<Tone, string> = { stop: "#DC2626", wait: "var(--caution)", none: "var(--muted-foreground)" };

interface Problem { code: string; message: string }
const problemOf = (e: unknown): Problem => ({
  code: e instanceof ApiError ? e.code ?? "" : "",
  message: friendlyError(e, "Couldn't make a plan. Try again."),
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 };
const sans = (size: number, weight = 400, color = "var(--foreground)"): React.CSSProperties => ({ fontFamily: "var(--font-sans)", fontSize: size, fontWeight: weight, color });
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const muted = "var(--muted-foreground)";
const btn = (primary: boolean, busy = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, flexShrink: 0,
  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  border: primary ? "none" : "1px solid var(--border)", backgroundColor: primary ? "var(--primary)" : "var(--card)", color: primary ? "var(--primary-foreground)" : "var(--foreground)",
});
const spinner = (size: number, light = false): React.CSSProperties => ({
  width: size, height: size, borderRadius: "50%", display: "inline-block", flexShrink: 0, animation: "spin 0.7s linear infinite",
  border: `2px solid ${light ? "rgba(255,255,255,0.4)" : "var(--border)"}`, borderTopColor: light ? "#fff" : "var(--primary)",
});

// ─── The card ─────────────────────────────────────────────────────────────────

// The summary a load list shows, made from a plan just worked out here — so the list's copy
// of the load is current without reading it again.
function summaryOf(p: Plan): FuelPlanSummary {
  const s = p.stops?.[0];
  return {
    id: p.id, computed_at: p.created_at, approx: p.approx, stops: p.totals.stops, gallons: p.totals.gallons,
    cost: p.totals.cost, savings: p.totals.savings, deadhead_mi: p.deadhead_mi, loaded_mi: p.loaded_mi, outdated: false,
    next_stop: s ? { name: s.name, state: s.state, route_mile: s.route_mile, buy_gal: s.buy_gal, price: s.pump_price, lat: s.location.lat, lng: s.location.lng } : null,
  };
}

export function FuelPlanCard({ loadId, loadLabel, driverName, truckUnit, finished, summary, places, onEdit, onPlanMade, autoStart = false }: {
  loadId: string;
  loadLabel: string;
  driverName: string;
  truckUnit: string;
  finished: boolean;
  summary: FuelPlanSummary | null;
  places: FuelRoutePlaces;
  onEdit?: () => void;
  onPlanMade?: (s: FuelPlanSummary) => void;
  // Opened from the list's fuel button: calculate at once, with the card in view.
  autoStart?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canRead = hasPerm(user, "fuel_plans", "read");
  const canMake = hasPerm(user, "fuel_plans", "create") && !finished;

  const [plan, setPlan]         = useState<Plan | null>(null);
  const [loading, setLoading]   = useState(false);
  const [working, setWorking]   = useState(false);
  const [problem, setProblem]   = useState<Problem | null>(null);
  const [asking, setAsking]     = useState(false);
  const [sending, setSending]   = useState(false);
  const [hidden, setHidden]     = useState(false); // the server says this user can't read plans

  // The saved plan is read from the server every time the load opens — not from the list's
  // copy of the load, which can be older than a plan made since — and again when the load
  // says a newer one exists (someone else recalculated).
  const planId = summary?.id ?? null;
  const madeHere = useRef<string | null>(null);
  useEffect(() => {
    if (!canRead) { setPlan(null); return; }
    if (planId && madeHere.current === planId) return; // already showing the one just made
    let gone = false;
    setLoading(true);
    api.get<Plan>(`/loads/${loadId}/fuel-plan`)
      .then((p) => { if (!gone && !madeHere.current) setPlan(p ?? null); })
      .catch((e) => {
        if (gone) return;
        if (isForbidden(e)) setHidden(true);
        else if (e instanceof ApiError && e.code === "no_plan") setPlan(null);
        else setProblem(problemOf(e));
      })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [loadId, planId, canRead]);

  // The load's flag speaks for the plan it was read beside. A plan made here since is newer
  // than the load as this page has it, so it is current until the list says otherwise.
  const outdated = !!plan && summary?.id === plan.id && summary.outdated;

  const calculate = async (startPct?: number) => {
    setWorking(true); setProblem(null);
    try {
      const p = await api.post<Plan>(`/loads/${loadId}/fuel-plan`, startPct == null ? {} : { start_fuel_pct: startPct });
      madeHere.current = p.id;
      setPlan(p);
      onPlanMade?.(summaryOf(p));
      setAsking(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "start_fuel_required") setAsking(true);
      else { setProblem(problemOf(e)); setAsking(false); }
    } finally {
      setWorking(false);
    }
  };

  // Opened from the list's fuel button: start once, and bring the card into view.
  const cardRef = useRef<HTMLElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current || !canMake) return;
    started.current = true;
    cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    void calculate();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRead || hidden) return null;
  // A finished load with no plan has nothing to show and nothing to do.
  if (finished && !plan && !loading) return null;

  const fixFor = (code: string): React.ReactNode => {
    const fix = PROBLEMS[code]?.fix ?? (PROBLEMS[code] ? undefined : "retry");
    if (fix === "retry" && canMake) return <button onClick={() => calculate()} disabled={working} style={btn(false, working)}>Try again</button>;
    if (fix === "truck") return <button onClick={() => navigate("/workspace/equipments")} style={btn(false)}>Assign a truck</button>;
    if (fix === "edit" && onEdit) return <button onClick={onEdit} style={btn(false)}>Edit load</button>;
    return null;
  };

  return (
    <section ref={cardRef} aria-label="Fuel plan" style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "var(--primary-soft)", color: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Fuel size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={sans(14, 700)}>Fuel plan</div>
          {plan && (
            <div style={{ ...sans(12, 400, muted), marginTop: 2 }}>
              Calculated {fmtDateTime(plan.created_at)}
              {plan.truck_unit && <> · truck {plan.truck_unit}</>}
              {" · "}{plan.route_from === "eld" ? "from the truck's ELD position" : "from the next stop (no ELD position)"}
            </div>
          )}
        </div>
        {plan && canMake && (
          <>
            <button onClick={() => setSending(true)} disabled={working} style={btn(false, working)}><Send size={13} /> Send plan to driver</button>
            <button onClick={() => calculate()} disabled={working} style={btn(true, working)}>
              {working ? <span style={spinner(13, true)} /> : <RefreshCw size={13} />} {working ? "Calculating…" : "Recalculate"}
            </button>
          </>
        )}
      </div>

      {/* Can't make one */}
      {problem && (
        <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)", backgroundColor: "var(--muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flexShrink: 0, backgroundColor: TONE_COLOR[PROBLEMS[problem.code]?.tone ?? "stop"] }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={sans(13, 700)}>{PROBLEMS[problem.code]?.title ?? "Couldn't make a plan"}</div>
            <div style={{ ...sans(12.5, 400, muted), marginTop: 2, lineHeight: 1.5 }}>{problem.message}</div>
          </div>
          {fixFor(problem.code)}
        </div>
      )}

      {/* Working it out */}
      {working && !plan && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 4px" }}>
          <span style={spinner(18)} />
          <div>
            <div style={sans(13, 600)}>Finding truck stops and prices on the route…</div>
            <div style={{ ...sans(12, 400, muted), marginTop: 2 }}>This takes a few seconds.</div>
          </div>
        </div>
      )}

      {/* No plan yet */}
      {!plan && !working && (loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, ...sans(13, 400, muted), padding: "6px 0" }}><span style={spinner(14)} /> Loading the plan…</div>
      ) : !problem && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240, ...sans(13, 400, muted), lineHeight: 1.5, maxWidth: 620 }}>
            Finds the truck stops on the route and how many gallons to buy at each, so the trip costs the least. Uses the truck's ELD position and today's posted diesel prices.
          </div>
          {canMake && <button onClick={() => calculate()} style={btn(true)}><Fuel size={13} /> Calculate fuel plan</button>}
        </div>
      ))}

      {plan && (
        <>
          {outdated && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--caution-line)", backgroundColor: "var(--caution-soft)" }}>
              <AlertCircle size={15} style={{ color: "var(--caution)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 200, ...sans(12.5, 500) }}>The load changed after this plan (or the driver got another truck). The stops may be wrong now.</span>
              {canMake && <button onClick={() => calculate()} disabled={working} style={btn(true, working)}>{working ? "Calculating…" : "Recalculate"}</button>}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: outdated || working ? 0.55 : 1, transition: "opacity 0.15s" }}>
            <PlanBody plan={plan} places={places} />
          </div>
        </>
      )}

      {asking && (
        <StartFuelDialog
          truckUnit={plan?.truck_unit || truckUnit}
          tankGal={plan?.assumptions.tank_gal ?? null}
          busy={working}
          onCancel={() => setAsking(false)}
          onSubmit={(pct) => calculate(pct)}
        />
      )}
      {sending && plan && (
        <SendPlanDialog loadId={loadId} loadLabel={loadLabel} driverName={driverName} outdated={outdated} onClose={() => setSending(false)} />
      )}
    </section>
  );
}

// ─── The plan itself ──────────────────────────────────────────────────────────

function PlanBody({ plan, places }: { plan: Plan; places: FuelRoutePlaces }) {
  const stops = plan.stops ?? [];
  const net = plan.assumptions.ifta_mode === "net";
  const t = plan.totals;
  const old = stops.filter((s) => s.stale_price || priceAge(s.price_age_h).old);

  const tiles: { label: string; value: string; sub: string; good?: boolean }[] = [
    { label: "Fuel stops", value: String(t.stops), sub: t.detour_mi > 0 ? `${t.detour_mi.toFixed(1)} mi of detours` : "on the route" },
    { label: "Gallons", value: gal(t.gallons), sub: `ends with ${gal(plan.end_fuel_gal)} gal` },
    { label: "Fuel cost", value: money(t.cost), sub: net ? `${money(t.net_cost)} after IFTA` : "at the pump" },
    t.savings != null
      // Never below $0: plans made before the server clamped it could still say "$-4.29".
      ? { label: "Saves", value: money(Math.max(0, t.savings)), sub: "vs filling up at a quarter tank", good: t.savings > 0 }
      : { label: "Saves", value: "—", sub: "nothing to compare with" },
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {tiles.map((x) => (
          <div key={x.label} style={{ padding: "10px 12px", borderRadius: 9, backgroundColor: x.good ? "var(--primary-soft)" : "var(--muted)" }}>
            <div style={sans(12, 500, muted)}>{x.label}</div>
            <div style={{ ...mono, fontSize: 19, fontWeight: 700, color: x.good ? "var(--primary)" : "var(--foreground)", marginTop: 2 }}>{x.value}</div>
            <div style={{ ...sans(11.5, 400, muted), marginTop: 1 }}>{x.sub}</div>
          </div>
        ))}
      </div>

      <RouteBar plan={plan} places={places} />

      {stops.length === 0 ? (
        <div style={{ ...sans(13, 500), padding: "10px 12px", borderRadius: 9, backgroundColor: "var(--primary-soft)" }}>
          No fuel stop needed: the tank covers the trip and ends with {gal(plan.end_fuel_gal)} gal.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", ...sans(13) }}>
            <thead>
              <tr style={{ textAlign: "left", backgroundColor: "var(--muted)" }}>
                {["#", "Truck stop", "Route mile", "Arrive with", "Buy", "Price", "Cost"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", ...sans(11, 600, muted), letterSpacing: "0.05em", textTransform: "uppercase", textAlign: i >= 2 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stops.map((s) => {
                const age = priceAge(s.price_age_h);
                return (
                  <tr key={s.seq} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "12px" }}>
                      <span style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", ...sans(11.5, 700, "#fff") }}>{s.seq}</span>
                    </td>
                    <td style={{ padding: "12px", minWidth: 260 }}>
                      <div style={sans(13.5, 600)}>{s.name}{(s.city || s.state) && <span style={{ fontWeight: 400, color: muted }}> · {[s.city, s.state].filter(Boolean).join(", ")}</span>}</div>
                      <a href={mapsLink(s.location)} target="_blank" rel="noreferrer" style={{ ...sans(12.5, 400, "var(--primary)"), textDecoration: "none" }}>{s.address || "Open in Maps"}</a>
                      {s.off_route_mi >= 0.1 && <div style={{ ...sans(12, 400, muted), marginTop: 2 }}>{s.off_route_mi.toFixed(1)} mi off the route</div>}
                      {(s.alternatives ?? []).length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                          {(s.alternatives ?? []).map((a, i) => (
                            <div key={i} style={sans(12, 400, muted)}>
                              Also nearby: <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{a.name}</span> · mile {whole(a.route_mile)} · <span style={mono}>{price(a.pump_price)}</span>{" "}
                              {Math.abs(a.delta) < 0.0005
                                ? <span>same price</span>
                                : <span style={{ ...mono, color: a.delta > 0 ? "#DC2626" : "var(--primary)" }}>{a.delta > 0 ? "+" : "−"}${Math.abs(a.delta).toFixed(3)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", ...mono }}>{whole(s.route_mile)}</td>
                    <td style={{ padding: "12px", textAlign: "right", ...mono }}>{gal(s.arrive_gal)} gal</td>
                    <td style={{ padding: "12px", textAlign: "right", ...mono, fontWeight: 700 }}>{gal(s.buy_gal)} gal</td>
                    <td style={{ padding: "12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ ...mono, fontWeight: 600 }}>{price(s.pump_price)}</div>
                      {net && <div style={{ ...sans(11.5, 400, muted), marginTop: 1 }}><span style={mono}>{price(s.effective_price)}</span> after IFTA</div>}
                      {s.price_source === "regional_average"
                        ? <div style={{ ...sans(11.5, 500, "var(--caution)"), marginTop: 1 }}>area average</div>
                        : age.text && <div style={{ ...sans(11.5, age.old ? 500 : 400, age.old ? "var(--caution)" : muted), marginTop: 1 }}>{age.text}</div>}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", ...mono, fontWeight: 600 }}>{money(s.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {old.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 9, backgroundColor: "var(--caution-soft)", ...sans(12.5, 500) }}>
          <AlertCircle size={15} style={{ color: "var(--caution)", flexShrink: 0, marginTop: 1 }} />
          <span>
            {old.length === 1 ? `Stop ${old[0].seq}'s` : `Stops ${old.map((s) => s.seq).join(", ")}'s`} posted price is over a day old, so it may have moved. Recalculate before the driver gets there.
          </span>
        </div>
      )}

      {(plan.notes ?? []).length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3, ...sans(12.5, 400, muted) }}>
          {(plan.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      <Assumptions plan={plan} />
    </>
  );
}

// Where the truck is, the empty run to the pickup, and where each fuel stop falls.
function RouteBar({ plan, places }: { plan: Plan; places: FuelRoutePlaces }) {
  const total = plan.route_miles > 0 ? plan.route_miles : plan.deadhead_mi + plan.loaded_mi;
  if (total <= 0) return null;
  // Only a route that starts at the truck drives its deadhead on the bar.
  const empty = plan.route_from === "eld" ? Math.min(plan.deadhead_mi, total) : 0;
  const at = (mi: number) => `${Math.max(0, Math.min(100, (mi / total) * 100))}%`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", ...sans(12, 500, muted) }}>
        <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{whole(total)} mi to go</span>
        <span>{plan.deadhead_mi > 0 && `${whole(plan.deadhead_mi)} mi empty · `}{whole(plan.loaded_mi)} mi loaded</span>
      </div>
      <div style={{ position: "relative", height: 26 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 10, height: 6, borderRadius: 3, backgroundColor: "var(--primary-soft)" }} />
        {empty > 0 && (
          <div title={`${whole(empty)} mi empty`} style={{ position: "absolute", left: 0, width: at(empty), top: 10, height: 6, borderRadius: 3, background: "repeating-linear-gradient(45deg, var(--muted-foreground) 0 3px, transparent 3px 7px)", opacity: 0.55 }} />
        )}
        {empty > 0 && <span style={{ position: "absolute", left: at(empty), top: 6, width: 2, height: 14, marginLeft: -1, backgroundColor: muted }} />}
        {(plan.stops ?? []).map((s) => (
          <span key={s.seq} title={`${s.name} · mile ${whole(s.route_mile)} · buy ${gal(s.buy_gal)} gal`}
            style={{ position: "absolute", left: at(s.route_mile), top: 1, width: 24, height: 24, marginLeft: -12, borderRadius: "50%", backgroundColor: "var(--primary)", border: "2px solid var(--card)", boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", ...sans(11, 700, "#fff") }}>
            {s.seq}
          </span>
        ))}
      </div>
      {/* The pickup's name sits under its mark; the ends hold the start and the delivery. */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10, minHeight: 16, ...sans(11.5, 400, muted) }}>
        <span>{plan.route_from === "eld" ? "Truck now" : places.next}</span>
        <span style={{ textAlign: "right" }}>Delivery · {places.delivery}</span>
        {empty > 0 && places.pickup && (
          <span style={{ position: "absolute", left: at(empty), top: 18, transform: `translateX(${empty / total < 0.2 ? "-12px" : "-50%"})`, whiteSpace: "nowrap", color: "var(--foreground)" }}>
            Pickup · {places.pickup}
          </span>
        )}
      </div>
      {empty > 0 && places.pickup && <div style={{ height: 14 }} />}
    </div>
  );
}

function Assumptions({ plan }: { plan: Plan }) {
  const a = plan.assumptions;
  const from = a.start_fuel_from === "eld" ? "ELD" : a.start_fuel_from === "request" ? "entered" : "assumed";
  const rows: [string, string][] = [
    ["Tank", `${gal(a.tank_gal)} gal`],
    ["Miles per gallon", String(a.mpg)],
    ["Never below", `${whole(a.reserve_pct)}% · ${a.reserve_gal.toFixed(1)} gal`],
    ["Smallest buy", `${gal(a.min_buy_gal)} gal`],
    ["Starting fuel", `${whole(a.start_fuel_pct)}% · ${a.start_fuel_gal.toFixed(1)} gal (${from})`],
    ["Max off the route", `${a.max_off_route_mi} mi`],
    ["Prices ranked by", a.ifta_mode === "net" ? `After IFTA · ${a.ifta_quarter}` : "Pump price"],
    ["Truck stops checked", String(plan.candidates)],
  ];
  return (
    <details style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, ...sans(12.5, 600, muted) }}>
        <ChevronDown size={14} /> What the plan assumed
      </summary>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px 16px" }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={sans(11.5, 400, muted)}>{k}</div>
            <div style={{ ...sans(13, 600), marginTop: 1 }}>{v}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 400 }} />
      <div role="dialog" aria-modal="true" aria-label={label}
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 420, maxWidth: "calc(100vw - 32px)", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </>,
    document.body,
  );
}

// The ELD sends no fuel level: ask how full the tank is.
function StartFuelDialog({ truckUnit, tankGal, busy, onCancel, onSubmit }: {
  truckUnit: string; tankGal: number | null; busy: boolean; onCancel: () => void; onSubmit: (pct: number) => void;
}) {
  const [text, setText] = useState("");
  const pct = text.trim() === "" ? NaN : Number(text);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const submit = () => { if (valid && !busy) onSubmit(pct); };
  useLayer(true, { onEscape: () => { if (!busy) onCancel(); }, onSubmit: submit });

  return (
    <Modal label="Starting fuel" onClose={() => { if (!busy) onCancel(); }}>
      <div style={sans(15, 700)}>How much fuel is in the truck?</div>
      <div style={{ ...sans(13, 400, muted), lineHeight: 1.5 }}>
        {truckUnit ? `Truck ${truckUnit}'s` : "The truck's"} ELD isn't sending a fuel level. Ask the driver and enter it here.
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, ...sans(12.5, 600) }}>
        Fuel in the tank
        <span style={{ display: "flex", alignItems: "center", height: 38, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", backgroundColor: "var(--card)" }}>
          <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Fuel in the tank, percent"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", ...mono, fontSize: 14, color: "var(--foreground)" }} />
          <span style={sans(13, 500, muted)}>%</span>
        </span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {[["¼ tank", 25], ["½ tank", 50], ["¾ tank", 75], ["Full", 100]].map(([l, v]) => (
          <button key={l} onClick={() => setText(String(v))}
            style={{ height: 32, borderRadius: 7, border: `1px solid ${pct === v ? "var(--primary)" : "var(--border)"}`, backgroundColor: pct === v ? "var(--primary-soft)" : "var(--card)", cursor: "pointer", ...sans(12.5, 600, pct === v ? "var(--primary)" : "var(--foreground)") }}>
            {l}
          </button>
        ))}
      </div>
      {valid && tankGal != null && <div style={sans(12, 400, muted)}>= {gal((pct / 100) * tankGal)} gal of a {gal(tankGal)} gal tank</div>}
      {text !== "" && !valid && <div style={sans(12, 500, "#DC2626")}>Enter a number from 0 to 100.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} disabled={busy} style={btn(false, busy)}>Cancel</button>
        <button onClick={submit} disabled={!valid || busy} style={btn(true, busy || !valid)}>
          {busy && <span style={spinner(13, true)} />} {busy ? "Calculating…" : "Calculate"}
        </button>
      </div>
    </Modal>
  );
}

// Posting to the group can't be taken back, so it takes a click (Enter doesn't send).
function SendPlanDialog({ loadId, loadLabel, driverName, outdated, onClose }: {
  loadId: string; loadLabel: string; driverName: string; outdated: boolean; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useLayer(true, { onEscape: () => { if (!busy) onClose(); } });

  const send = async () => {
    setBusy(true); setProblem("");
    try {
      await api.post(`/loads/${loadId}/fuel-plan/telegram`);
      notify.success("Fuel plan sent to the driver's group");
      onClose();
    } catch (e) {
      setProblem(friendlyError(e, "Couldn't send it. Try again."));
      setBusy(false);
    }
  };

  return (
    <Modal label="Send fuel plan" onClose={() => { if (!busy) onClose(); }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "var(--primary-soft)", color: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Send size={16} /></span>
        <div style={sans(15, 700)}>Send {loadLabel ? `${loadLabel}'s` : "this"} fuel plan</div>
      </div>
      <div style={{ ...sans(13, 400, muted), lineHeight: 1.5 }}>
        {driverName || "The driver"} gets the stops, the gallons to buy at each and the total in their Telegram group.
      </div>
      {outdated && <div style={{ ...sans(12.5, 500, "var(--caution)"), lineHeight: 1.5 }}>This plan is out of date. Recalculate first unless you're sure it still holds.</div>}
      {problem && <div role="alert" style={{ ...sans(13, 400, "#DC2626"), lineHeight: 1.5 }}>{problem}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} disabled={busy} style={btn(false, busy)}>Cancel</button>
        <button onClick={send} disabled={busy} style={btn(true, busy)}>{busy && <span style={spinner(13, true)} />} {busy ? "Sending…" : "Send"}</button>
      </div>
    </Modal>
  );
}

// ─── On the loads list ────────────────────────────────────────────────────────

// A load's fuel at a glance: the plan's stops and savings with the first stop, out of date,
// or "—" with none (it's made from the row's fuel button). onOpen opens the load and its plan.
// The first stop's route mile is left out: it's counted from where the truck was when the
// plan was made, and reads as a distance from where it is now.
export function FuelCell({ summary, finished, onOpen }: {
  summary: FuelPlanSummary | null; finished: boolean; onOpen: () => void;
}) {
  const link: React.CSSProperties = { background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" };
  if (!summary) return <span style={sans(12, 400, muted)}>—</span>;
  const n = summary.next_stop;
  const line = summary.stops === 0 ? "No stop needed"
    : `${summary.stops} stop${summary.stops === 1 ? "" : "s"}${summary.savings && summary.savings > 0 ? ` · saves $${Math.round(summary.savings).toLocaleString("en-US")}` : ""}`;
  return (
    <button onClick={onOpen} title="Open the fuel plan" style={{ ...link, display: "flex", flexDirection: "column", gap: 2 }}>
      {summary.outdated && !finished ? (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...sans(12, 600, "var(--caution)") }}><AlertCircle size={12} /> Out of date</span>
          <span style={sans(11, 400, muted)}>{line} · recalculate</span>
        </>
      ) : (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, ...sans(12, 600, finished ? muted : "var(--primary)") }}><Fuel size={12} /> {line}</span>
          {n && !finished && <span style={{ ...sans(11, 400, muted), whiteSpace: "nowrap" }}>Next: {n.name}{n.state ? `, ${n.state}` : ""}</span>}
          {summary.stops === 0 && <span style={sans(11, 400, muted)}>the tank covers the trip</span>}
        </>
      )}
    </button>
  );
}

// The row's fuel button, beside its Telegram one: opens the load and works its plan out —
// a first one, or again when it has one.
export function FuelActionBtn({ loadLabel, hasPlan, onClick }: { loadLabel: string; hasPlan: boolean; onClick: () => void }) {
  const label = `${hasPlan ? "Recalculate" : "Calculate"} the fuel plan for ${loadLabel || "this load"}`;
  return (
    <button onClick={onClick} aria-label={label} title={label}
      style={{ width: 30, height: 30, borderRadius: 7, border: "none", backgroundColor: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.backgroundColor = "var(--primary-soft)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
      <Fuel size={14} />
    </button>
  );
}

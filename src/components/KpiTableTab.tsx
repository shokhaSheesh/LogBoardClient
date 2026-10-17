import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { fmtDate } from "../lib/dates";
import { ActionBtn, DeleteConfirm, TH } from "./LoadsPage";
import { FieldLabel, useEscape } from "./DriversPage";
import { useLayer } from "../lib/layers";
import { NumberField } from "./NumberField";
import { Dash } from "./Dash";
import { FormError, formErrorInModal, friendlyError, notify } from "./feedback";
import { useRowNav } from "../lib/rowNav";

// Settings → KPI Table: the company's one table of rules for dispatchers paid by it. Each rule
// is "a week whose gross and RPM fall in these ranges pays this percent", plus an optional
// bonus paid once for the week; a week no rule fits pays the "below the table" percent. Every change counts from the current work week on —
// earlier weeks keep the table they had (the server files each change under its week).

interface Rule { id: string; gross_from: number; gross_to: number | null; rpm_from: number; rpm_to: number | null; percent: number; bonus?: number }
interface Table { active_from: string; fallback_percent: number; rules: Rule[] }
interface View { current: Table | null; week_start: string; week_end: string; history: string[] }

const whole = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const rpm = (n: number) => `$${n.toFixed(2)}`;
// "8,000 – 9,000" or "20,000 +": an empty "to" means "and up".
const span = (from: number, to: number | null, fmt: (n: number) => string) => (to == null ? `${fmt(from)} +` : `${fmt(from)} – ${fmt(to)}`);
const td: React.CSSProperties = { padding: "11px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", fontVariantNumeric: "tabular-nums", verticalAlign: "middle" };

export function KpiTableTab({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [fallbackEdit, setFallbackEdit] = useState<number | undefined>(undefined);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  // The inline "below the table" edit: Esc cancels it, Enter saves it.
  useLayer(fallbackOpen, { onEscape: () => setFallbackOpen(false), onSubmit: () => { void saveFallback(); } });
  const [fallbackBusy, setFallbackBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    api.get<View>("/kpi/table")
      .then((v) => { if (!gone) setView(v); })
      .catch((e) => { if (!gone) setError(friendlyError(e, "Couldn't load the KPI table.")); });
    return () => { gone = true; };
  }, []);

  const rules = view?.current?.rules ?? [];
  const nav = useRowNav(rules.length, view);
  const fallback = view?.current?.fallback_percent ?? 0.5;
  const week = view ? `${fmtDate(view.week_start)} – ${fmtDate(view.week_end)}` : "";

  const del = async () => {
    if (!deleting) return;
    setDelBusy(true); setDelErr(null);
    try {
      setView(await api.delete<View>(`/kpi/table/rules/${deleting.id}`));
      notify.success("Rule removed");
      setDeleting(null);
    } catch (e) {
      setDelErr(friendlyError(e, "Couldn't remove the rule."));
    } finally {
      setDelBusy(false);
    }
  };

  const saveFallback = async () => {
    if (fallbackEdit == null) return;
    setFallbackBusy(true);
    try {
      setView(await api.put<View>("/kpi/table/fallback", { percent: fallbackEdit }));
      notify.success("Saved");
      setFallbackOpen(false);
    } catch (e) {
      notify.error(friendlyError(e, "Couldn't save the percent."));
    } finally {
      setFallbackBusy(false);
    }
  };

  if (error) return <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</div>;
  if (!view) return <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</div>;

  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {/* What the table is, from when a change counts, and the percent below it */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px 16px", flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>KPI table</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
            For dispatchers paid by the table: their week's gross and RPM pick the percent of every load that week.
            Changes count from this week ({week}); earlier weeks keep their table.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)" }}>Below the table</span>
          {fallbackOpen ? (
            <>
              <div style={{ width: 96 }}>
                <NumberField label="Below the table percent" value={fallbackEdit} suffix="%" max={100} decimals={3} autoFocus onChange={(n) => setFallbackEdit(n)} />
              </div>
              <button type="button" aria-label="Save" onClick={saveFallback} disabled={fallbackBusy} style={{ ...btn, padding: "0 10px", border: "none", backgroundColor: "var(--primary)", color: "#fff" }}><Check size={14} /></button>
              <button type="button" aria-label="Cancel" onClick={() => setFallbackOpen(false)} disabled={fallbackBusy} style={{ ...btn, padding: "0 10px", border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }}><X size={14} /></button>
            </>
          ) : (
            <>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{fallback}%</span>
              {canEdit && <ActionBtn label="Change the percent below the table" tone="edit" icon={<Pencil size={14} />} onClick={() => { setFallbackEdit(fallback); setFallbackOpen(true); }} />}
            </>
          )}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing("new")} style={{ ...btn, height: 34, padding: "0 14px", border: "none", backgroundColor: "var(--primary)", color: "#fff" }}>
            <Plus size={15} /> New rule
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <TH>Weekly gross</TH>
              <TH>RPM</TH>
              <TH align="right">Percent</TH>
              <TH align="right">Bonus</TH>
              <TH width={92} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody ref={nav.ref}>
            {rules.map((r, i) => (
              <tr {...nav.row(i)} key={r.id}>
                <td style={td}>{span(r.gross_from, r.gross_to, whole)}</td>
                <td style={td}>{span(r.rpm_from, r.rpm_to, rpm)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.percent}%</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: r.bonus ? "var(--primary)" : "var(--muted-foreground)" }}>{r.bonus ? `+${whole(r.bonus)}` : <Dash />}</td>
                <td style={{ ...td, textAlign: "center", padding: "6px 10px" }}>
                  {canEdit ? (
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      <ActionBtn label="Edit rule" tone="edit" icon={<Pencil size={14} />} onClick={() => setEditing(r)} />
                      <ActionBtn label="Delete rule" tone="delete" icon={<Trash2 size={14} />} onClick={() => setDeleting(r)} />
                    </div>
                  ) : <Dash />}
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No rules yet. Until there are, everyone paid by the table gets {fallback}%.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <RuleModal rule={editing === "new" ? null : editing} week={week} onClose={() => setEditing(null)}
          onSaved={(v) => { setView(v); setEditing(null); }} />
      )}
      {deleting && (
        <DeleteConfirm label="" busy={delBusy} error={delErr} title="Delete rule?"
          body={<>The rule for <strong>{span(deleting.gross_from, deleting.gross_to, whole)}</strong> at RPM <strong>{span(deleting.rpm_from, deleting.rpm_to, rpm)}</strong> stops counting from this week ({week}).</>}
          onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={del} />
      )}
    </div>
  );
}

// Weekly gross from–to, RPM from–to, percent. An empty "to" means "and up".
function RuleModal({ rule, week, onClose, onSaved }: { rule: Rule | null; week: string; onClose: () => void; onSaved: (v: View) => void }) {
  const isNew = !rule;
  const [grossFrom, setGrossFrom] = useState<number | undefined>(rule?.gross_from);
  const [grossTo, setGrossTo] = useState<number | undefined>(rule?.gross_to ?? undefined);
  const [rpmFrom, setRpmFrom] = useState<number | undefined>(rule?.rpm_from);
  const [rpmTo, setRpmTo] = useState<number | undefined>(rule?.rpm_to ?? undefined);
  const [percent, setPercent] = useState<number | undefined>(rule?.percent);
  const [bonus, setBonus] = useState<number | undefined>(rule?.bonus || undefined);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Esc asks before throwing away what was typed; Enter saves.
  const values = JSON.stringify([grossFrom, grossTo, rpmFrom, rpmTo, percent, bonus]);
  const [opened] = useState(values);
  const requestClose = useEscape(onClose, saving, { onSave: () => { void save(); }, dirty: values !== opened });

  // NumberField reports a cleared field as 0; a "to" of 0 can't be above any "from", so read it as empty.
  const toOrNull = (n: number | undefined) => (n == null || n === 0 ? null : n);
  const grossErr = grossFrom == null ? "Enter where the gross starts." : toOrNull(grossTo) != null && grossTo! <= grossFrom ? "\"To\" must be above \"from\"." : null;
  const rpmErr = rpmFrom == null ? "Enter where the RPM starts." : toOrNull(rpmTo) != null && rpmTo! <= rpmFrom ? "\"To\" must be above \"from\"." : null;
  const pctErr = percent == null || percent === 0 ? "Enter the percent." : null;

  const save = async () => {
    setTried(true);
    if (grossErr || rpmErr || pctErr) return;
    setSaving(true); setError(null);
    const body = { gross_from: grossFrom, gross_to: toOrNull(grossTo), rpm_from: rpmFrom, rpm_to: toOrNull(rpmTo), percent, bonus: bonus ?? 0 };
    try {
      const v = isNew ? await api.post<View>("/kpi/table/rules", body) : await api.put<View>(`/kpi/table/rules/${rule.id}`, body);
      notify.success(isNew ? "Rule added" : "Rule updated");
      onSaved(v);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the rule."));
    } finally {
      setSaving(false);
    }
  };

  const hint = (t: string | null) => tried && t ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#EF4444" }}>{t}</span> : null;
  const pair = (label: string, from: number | undefined, setFrom: (n: number) => void, to: number | undefined, setTo: (n: number) => void, opts: { prefix?: string; decimals: number; fromPh: string; toPh: string }, err: string | null) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
      <FieldLabel required error={tried && !!err}>{label}</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
        <NumberField label={`${label} from`} value={from} prefix={opts.prefix} decimals={opts.decimals} placeholder={opts.fromPh} onChange={setFrom} invalid={tried && !!err} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>to</span>
        <NumberField label={`${label} to`} value={to} prefix={opts.prefix} decimals={opts.decimals} placeholder={opts.toPh} onChange={setTo} />
      </div>
      {hint(err)}
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={isNew ? "New KPI rule" : "Edit KPI rule"} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 480, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{isNew ? "New KPI rule" : "Edit KPI rule"}</span>
          <button onClick={requestClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {pair("Weekly gross", grossFrom, setGrossFrom, grossTo, setGrossTo, { prefix: "$", decimals: 0, fromPh: "8000", toPh: "and up" }, grossErr)}
          {pair("RPM", rpmFrom, setRpmFrom, rpmTo, setRpmTo, { prefix: "$", decimals: 2, fromPh: "2.00", toPh: "and up" }, rpmErr)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel required error={tried && !!pctErr}>Percent</FieldLabel>
              <NumberField label="Percent" value={percent} suffix="%" max={100} decimals={3} placeholder="1" onChange={setPercent} invalid={tried && !!pctErr} />
              {hint(pctErr)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel>Bonus</FieldLabel>
              <NumberField label="Bonus" value={bonus} prefix="$" decimals={2} max={100000} placeholder="0" onChange={(n) => setBonus(n || undefined)} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)" }}>Once per week, on top of the percent.</span>
            </div>
          </div>
        </div>
        <FormError message={error} style={formErrorInModal} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Add rule" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

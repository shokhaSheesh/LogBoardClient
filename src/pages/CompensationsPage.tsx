import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, Pencil, Trash2, X, Check, ChevronDown, CircleCheck, Hourglass, CircleX } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { fmtDate } from "../lib/dates";
import { menuPosition } from "../lib/menuPosition";
import {
  COMP_STATUSES, COMP_TYPES, compStatus, compType, createCompensation, deleteCompensation,
  listCompensations, updateCompensation,
  type CompInput, type CompList, type CompStatus, type CompType, type Compensation,
} from "../lib/compensations";
import { ActionBtn, CustomSelect, DeleteConfirm, Pagination, TH } from "../components/LoadsPage";
import { FieldLabel, useEscape } from "../components/DriversPage";
import { AsyncSearchableSelect } from "../components/AsyncSelect";
import { DatePicker } from "../components/DatePicker";
import { NumberField } from "../components/NumberField";
import { PeriodFilter, ALL_TIME, type Period } from "../components/PeriodFilter";
import { Kpi } from "../components/Kpi";
import { Dash } from "../components/Dash";
import { ScrollPane } from "../components/ScrollX";
import { FormError, formErrorInModal, friendlyError, notify } from "../components/feedback";

// Compensations: what the carrier has asked brokers to pay on top of a load's rate (TONU,
// detention, layover, extra miles), with where each request stands. A record only — a paid
// request does not change gross or payouts.

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Whole days since a YYYY-MM-DD day, for how long a request has been waiting.
const daysSince = (day: string) => Math.max(0, Math.round((Date.parse(todayIso()) - Date.parse(day)) / 86400000));

const TYPE_FILTER = [{ value: "", label: "All types" }, ...COMP_TYPES];
const STATUS_FILTER = [{ value: "", label: "All statuses" }, ...COMP_STATUSES.map(({ value, label }) => ({ value, label }))];
const td: React.CSSProperties = { padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--foreground)" };

export function CompensationsPage() {
  const { user } = useAuth();
  const canCreate = hasPerm(user, "compensations", "create");
  const canUpdate = hasPerm(user, "compensations", "update");
  const canDelete = hasPerm(user, "compensations", "delete");

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<CompType | "">("");
  const [status, setStatus] = useState<CompStatus | "">("");
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<CompList | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);
  const [editing, setEditing] = useState<Compensation | "new" | null>(null);
  const [deleting, setDeleting] = useState<Compensation | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 250); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    listCompensations({ q, type: type || undefined, status: status || undefined, from: period.from || undefined, to: period.to || undefined, page, pageSize })
      .then((r) => { if (!gone) setData(r); })
      .catch((e) => { if (!gone) notify.error(friendlyError(e)); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [q, type, status, period, page, pageSize, fetchKey]);

  const refresh = () => setFetchKey((k) => k + 1);

  const changeStatus = async (c: Compensation, s: CompStatus) => {
    if (s === c.status) return;
    try {
      const { id: _id, ...rest } = c;
      await updateCompensation(c.id, { ...rest, status: s });
      notify.success("Status updated");
      refresh();
    } catch (e) {
      notify.error(friendlyError(e, "Update failed"));
    }
  };

  const del = async () => {
    if (!deleting) return;
    setDelBusy(true); setDelErr(null);
    try {
      await deleteCompensation(deleting.id);
      notify.success("Request deleted");
      setDeleting(null);
      refresh();
    } catch (e) {
      setDelErr(friendlyError(e, "Delete failed"));
    } finally {
      setDelBusy(false);
    }
  };

  const sum = data?.summary;
  const card = (s: CompStatus, icon: React.ReactNode, tone: "plain" | "good" | "bad") => {
    const v = sum?.[s];
    return (
      <Kpi icon={icon} label={compStatus(s).label} tone={tone}
        value={v ? (v.amount ? money(v.amount) : <Dash />) : "…"}
        note={v ? `${v.count} ${v.count === 1 ? "request" : "requests"}` : undefined} />
    );
  };
  const rows = data?.items ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "14px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, flexShrink: 0 }}>
          {card("paid", <CircleCheck size={18} />, "good")}
          {card("pending", <Hourglass size={18} />, "plain")}
          {card("not_approved", <CircleX size={18} />, "bad")}
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ position: "relative", width: 240 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search load, broker…"
                style={{ width: "100%", height: 34, paddingLeft: 30, paddingRight: 10, fontFamily: "var(--font-sans)", fontSize: 13, backgroundColor: "var(--input-background)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--foreground)", outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }} />
            </div>
            <CustomSelect value={type} options={TYPE_FILTER} onChange={(v) => { setType(v as CompType | ""); setPage(1); }} width={140} />
            <CustomSelect value={status} options={STATUS_FILTER} onChange={(v) => { setStatus(v as CompStatus | ""); setPage(1); }} width={150} />
            <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} weekStartDay={user?.company?.week_start_day ?? 1} />
            <div style={{ flex: 1 }} />
            {canCreate && (
              <button onClick={() => setEditing("new")}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "none", backgroundColor: "var(--primary)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={15} /> New request
              </button>
            )}
          </div>

          <ScrollPane style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, opacity: loading && rows.length > 0 ? 0.45 : 1, transition: "opacity 0.15s" }}>
              <thead>
                <tr>
                  <TH width={40}>#</TH>
                  <TH width={130}>Load number</TH>
                  <TH width={240}>Broker</TH>
                  <TH width={120}>Type</TH>
                  <TH width={140}>Status</TH>
                  <TH width={110} align="right">Amount</TH>
                  <TH width={140}>Requested</TH>
                  <TH width={280}>Comment</TH>
                  <TH width={92} align="center" pinned>Actions</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const waiting = c.status === "pending" ? daysSince(c.requestedAt) : null;
                  return (
                    <tr key={c.id} style={{ backgroundColor: "var(--card)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-faint)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; }}>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center" }}>{(page - 1) * pageSize + i + 1}</td>
                      <td style={td}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>{c.loadRef}</span>
                      </td>
                      <td style={td}>{c.broker || <Dash />}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>{compType(c.type)}</span>
                      </td>
                      <td style={td}><StatusPicker value={c.status} onChange={(s) => changeStatus(c, s)} readOnly={!canUpdate} /></td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: c.amount == null ? "var(--muted-foreground)" : c.status === "paid" ? "var(--primary)" : "var(--foreground)" }}>
                        {c.amount == null ? <Dash /> : money(c.amount)}
                      </td>
                      <td style={td}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(c.requestedAt)}</div>
                        {waiting != null && (
                          <div style={{ fontSize: 11, color: waiting >= 7 ? "var(--caution)" : "var(--muted-foreground)" }}>
                            {waiting === 0 ? "today" : `waiting ${waiting} ${waiting === 1 ? "day" : "days"}`}
                          </div>
                        )}
                      </td>
                      {/* Long comments are cut to two lines here; the full text shows on hover and in the edit form. */}
                      <td style={{ ...td, maxWidth: 280, color: c.comment ? "var(--foreground)" : "var(--muted-foreground)" }} title={c.comment || undefined}>
                        {c.comment
                          ? <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4, whiteSpace: "normal" }}>{c.comment}</div>
                          : <Dash />}
                      </td>
                      <td style={{ ...td, padding: "8px 10px", textAlign: "center", position: "sticky", right: 0, backgroundColor: "var(--card)", boxShadow: "inset 1px 0 0 var(--border)" }}>
                        <div style={{ display: "inline-flex", gap: 2 }}>
                          {canUpdate && <ActionBtn label={`Edit request for ${c.loadRef}`} tone="edit" icon={<Pencil size={14} />} onClick={() => setEditing(c)} />}
                          {canDelete && <ActionBtn label={`Delete request for ${c.loadRef}`} tone="delete" icon={<Trash2 size={14} />} onClick={() => setDeleting(c)} />}
                          {!canUpdate && !canDelete && <Dash />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                      {loading ? "Loading…" : q || type || status || period.from ? "No requests match your filters." : "No compensation requests yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollPane>

          <Pagination page={page} total={data?.total ?? 0} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} loading={loading} />
        </div>
      </div>

      {editing && (
        <CompensationModal value={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.loadRef} busy={delBusy} error={delErr} title="Delete request?"
          body={<>The {compType(deleting.type)} request for load <strong>{deleting.loadRef}</strong> will be permanently removed.</>}
          onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={del} />
      )}
    </div>
  );
}

// ─── Status, changed from the table ───────────────────────────────────────────

function StatusPill({ status, chevron }: { status: CompStatus; chevron?: boolean }) {
  const c = compStatus(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: c.color, backgroundColor: c.bg, borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none" }}>
      {c.label}{chevron && <ChevronDown size={10} style={{ opacity: 0.7 }} />}
    </span>
  );
}

function StatusPicker({ value, onChange, readOnly }: { value: CompStatus; onChange: (s: CompStatus) => void; readOnly?: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rect) return;
    const close = (e: Event) => { if (!anchor.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setRect(null); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); };
  }, [rect]);

  if (readOnly) return <StatusPill status={value} />;
  const pos = rect && menuPosition(rect, COMP_STATUSES.length, 168);
  return (
    <>
      <button ref={anchor} aria-label="Change status" onClick={() => setRect(rect ? null : anchor.current!.getBoundingClientRect())}
        style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}>
        <StatusPill status={value} chevron />
      </button>
      {rect && pos && createPortal(
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, minWidth: 168, padding: 5, display: "flex", flexDirection: "column", gap: 1, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)" }}>
          {COMP_STATUSES.map((s) => {
            const on = s.value === value;
            return (
              <button key={s.value} role="menuitem" onMouseDown={(e) => { e.preventDefault(); setRect(null); onChange(s.value); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 6, backgroundColor: on ? s.bg : "transparent", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.backgroundColor = "transparent"; }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: on ? 600 : 400, color: on ? s.color : "var(--foreground)" }}>{s.label}</span>
                {on && <Check size={12} style={{ color: s.color }} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Create / edit ────────────────────────────────────────────────────────────

function CompensationModal({ value, onClose, onSaved }: { value: Compensation | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !value;
  const [form, setForm] = useState<CompInput>(() => value
    ? (({ id: _id, ...rest }) => rest)(value)
    : { loadId: "", loadRef: "", broker: "", type: "detention", status: "pending", amount: null, requestedAt: todayIso(), comment: "" });
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brokers of the loads the picker has shown, so picking one fills the broker in.
  const brokers = useRef(new Map<string, { ref: string; broker: string }>());
  const set = (patch: Partial<CompInput>) => setForm((f) => ({ ...f, ...patch }));
  useEscape(onClose, saving);

  const missingLoad = !form.loadRef;
  const save = async () => {
    setTried(true);
    if (missingLoad || !form.requestedAt) return;
    setSaving(true); setError(null);
    try {
      if (isNew) await createCompensation(form); else await updateCompensation(value.id, form);
      notify.success(isNew ? "Request added" : "Request updated");
      onSaved();
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the request."));
    } finally {
      setSaving(false);
    }
  };

  const area: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 72 };

  return (
    <div role="dialog" aria-modal="true" aria-label={isNew ? "New compensation request" : "Edit compensation request"} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 560, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
            {isNew ? "New compensation request" : "Edit compensation request"}
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
            <FieldLabel required error={tried && missingLoad}>Load</FieldLabel>
            <AsyncSearchableSelect plain placeholder="Search load number…"
              value={form.loadId || form.loadRef}
              valueLabel={form.loadRef ? [form.loadRef, form.broker].filter(Boolean).join(" · ") : undefined}
              fetchPage={async (query, p) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { items, total } = await api.getList<any>("/loads", { q: query || undefined, page: p, page_size: 20 });
                return {
                  total,
                  items: (items ?? []).map((l) => {
                    const ref = String(l.load_id ?? "");
                    brokers.current.set(String(l.id), { ref, broker: l.broker ?? "" });
                    return { value: String(l.id), label: [ref, l.broker].filter(Boolean).join(" · ") };
                  }),
                };
              }}
              onChange={(id) => { const b = brokers.current.get(id); set({ loadId: id, loadRef: b?.ref ?? "", broker: b?.broker ?? "" }); }} />
            {tried && missingLoad && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#EF4444" }}>Pick the load this request is for.</span>}
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required>Type</FieldLabel>
            <CustomSelect plain value={form.type} options={COMP_TYPES} onChange={(v) => set({ type: v as CompType })} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required>Status</FieldLabel>
            <CustomSelect plain value={form.status} options={COMP_STATUSES.map(({ value: v, label }) => ({ value: v, label }))} onChange={(v) => set({ status: v as CompStatus })} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Amount</FieldLabel>
            <NumberField label="Amount" prefix="$" placeholder="" value={form.amount ?? undefined}
              onChange={(n) => set({ amount: n === 0 ? null : n })} />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required>Requested on</FieldLabel>
            <DatePicker label="Requested on" value={form.requestedAt} onChange={(d) => set({ requestedAt: d })} />
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
            <FieldLabel>Comment</FieldLabel>
            <textarea value={form.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="e.g. Waited 4h at shipper, check-in 06:10, loaded 10:25" style={area}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }} />
          </label>
        </div>

        <FormError message={error} style={formErrorInModal} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Add request" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

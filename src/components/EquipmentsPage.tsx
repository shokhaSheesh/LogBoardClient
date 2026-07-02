import { useState, useRef, useEffect } from "react";
import { Truck, Container, Plus, Pencil, Trash2, X, Check, Search, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet, Upload, FileText, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TruckRow {
  id: string;
  unit: string;
  driver: string;
  driver_id: string;
  make: string;
  model: string;
  vin: string;
}

interface TrailerRow {
  id: string;
  unit: string;
  driver: string;
  driver_id: string;
  make: string;
  model: string;
  vin: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      backgroundColor: type === "success" ? "#10B981" : "#EF4444",
      color: "#fff", borderRadius: 8, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
      animation: "slideUp 0.2s ease",
    }}>
      {type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
      {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer", display: "flex", padding: 0, marginLeft: 4 }}>
        <X size={13} />
      </button>
    </div>
  );
}

// ─── CustomSelect ─────────────────────────────────────────────────────────────

interface SelectOpt { value: string; label: string }

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, searchable = false,
}: {
  value: string;
  options: SelectOpt[];
  onChange: (v: string) => void;
  width?: number | string;
  compact?: boolean;
  dropUp?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const h = compact ? 30 : 34;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          outline: "none",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "var(--foreground)" : "transparent" }}>
          {selected?.label ?? "​"}
        </span>
        <ChevronDown
          size={13}
          style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          ...(dropUp ? { bottom: "calc(100% + 4px)", top: "auto" } : { top: "calc(100% + 4px)", bottom: "auto" }),
          left: 0, minWidth: "100%", width: "max-content",
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden",
        }}>
          {searchable && (
            <div style={{ padding: "8px 8px 4px" }}>
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  style={{
                    width: "100%", height: 30, paddingLeft: 26, paddingRight: 8,
                    fontFamily: "var(--font-sans)", fontSize: 12,
                    border: "1px solid var(--border)", borderRadius: 6,
                    backgroundColor: "var(--input-background)", color: "var(--foreground)",
                    outline: "none", boxSizing: "border-box" as const,
                  }}
                />
              </div>
            </div>
          )}
          <div style={{ maxHeight: 180, overflowY: "auto" as const, scrollbarWidth: "thin" as const, scrollbarColor: "var(--border) transparent" }}>
            {filtered.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 12px",
                    fontFamily: "var(--font-sans)", fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--primary)" : "var(--foreground)",
                    backgroundColor: isActive ? "var(--accent)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left", outline: "none",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = isActive ? "var(--accent)" : "transparent"; }}
                >
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function Pagination({
  total, page, pageSize, onPage, onPageSize, totalPending = false,
}: {
  total: number; page: number; pageSize: number; totalPending?: boolean;
  onPage: (p: number) => void; onPageSize: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const PBtn = ({ children, active = false, disabled = false, onClick }: {
    children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px",
        border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        backgroundColor: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)",
        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.38 : 1, outline: "none",
        transition: "background-color 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderTop: "1px solid var(--border)",
      backgroundColor: "var(--card)", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {total === 0 ? "No results" : `Showing ${from}–${to}`}
          {totalPending ? (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              total pending
            </span>
          ) : (
            <span>of {total}</span>
          )}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          Rows per page
        </span>
        <CustomSelect
          value={String(pageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => { onPageSize(Number(v)); onPage(1); }}
          width={72}
          compact
          dropUp
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ minWidth: 30, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>…</span>
          ) : (
            <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
          )
        )}
        <PBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: string }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
  }}>
    {children}
  </th>
);

const TD = ({ children, mono = false, center = false }: { children: React.ReactNode; mono?: boolean; center?: boolean }) => (
  <td style={{
    padding: "10px 14px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: mono ? 11 : 12, color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle", textAlign: center ? "center" : "left",
  }}>
    {children}
  </td>
);

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 6, border: "none",
      backgroundColor: bg, color, cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >
      {icon}
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type EquipRow = TruckRow | TrailerRow;

function EquipModal({ title, row, onClose, onSave, saving = false, driverOpts = [] }: {
  title: string;
  row: Partial<EquipRow>;
  onClose: () => void;
  onSave: (r: EquipRow) => void;
  saving?: boolean;
  driverOpts?: SelectOpt[];
}) {
  const [form, setForm] = useState<Partial<EquipRow>>(row);
  const [touched, setTouched] = useState<Partial<Record<keyof EquipRow, boolean>>>({});
  const set = (k: keyof EquipRow, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: keyof EquipRow) => setTouched((t) => ({ ...t, [k]: true }));
  const isNew = !row.id;

  const handleSave = () => {
    setTouched({ unit: true });
    if (!form.unit?.toString().trim()) return;
    onSave(form as EquipRow);
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Unit # and Driver side by side */}
          {(() => {
            const unitEmpty = touched.unit && !form.unit?.toString().trim();
            return (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: unitEmpty ? "#EF4444" : "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Unit # <span style={{ color: "#EF4444" }}>*</span>
                  </span>
                  <input
                    value={(form.unit as string) ?? ""}
                    onChange={(e) => set("unit", e.target.value)}
                    onBlur={() => touch("unit")}
                    style={{
                      fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 6, height: 34,
                      border: `1px solid ${unitEmpty ? "#EF4444" : "var(--border)"}`,
                      backgroundColor: unitEmpty ? "rgba(239,68,68,0.04)" : "var(--input-background)",
                      color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" as const,
                      boxShadow: unitEmpty ? "0 0 0 3px rgba(239,68,68,0.10)" : "none",
                    }}
                  />
                  {unitEmpty && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Unit # is required</span>}
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Driver
                  </span>
                  <CustomSelect
                    value={form.driver_id ?? ""}
                    options={[{ value: "", label: "— None —" }, ...driverOpts]}
                    onChange={(v) => set("driver_id", v)}
                    searchable
                  />
                </label>
              </>
            );
          })()}

          {/* Make / Model */}
          {(["make", "model"] as const).map((k) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {k === "make" ? "Make" : "Model"}
              </span>
              <input
                value={(form[k] as string) ?? ""}
                onChange={(e) => set(k, e.target.value)}
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px", borderRadius: 6, height: 34, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" as const }}
              />
            </label>
          ))}

          {/* VIN full-width */}
          <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>VIN</span>
            <input
              value={(form.vin as string) ?? ""}
              onChange={(e) => set("vin", e.target.value)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 13, padding: "7px 10px", borderRadius: 6, height: 34, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" as const, letterSpacing: "0.04em" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Remove equipment?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
          <strong>{label}</strong> will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ImportResult { created: number; failed: number; errors: { row: number; message: string }[] }

function ImportModal({ entityLabel, endpoint, onClose, onImported }: {
  entityLabel: string; endpoint: string; onClose: () => void; onImported?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError("Only CSV files are supported."); return; }
    setError(null); setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0]);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true); setError(null);
    try {
      const res = await api.upload<ImportResult>(endpoint, file);
      setResult(res);
      if (res.created > 0) onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet size={15} color="#059669" />
            </div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              Import {entityLabel}s
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? "var(--primary)" : file ? "#10B981" : "var(--border)"}`,
              borderRadius: 10, padding: "36px 20px", textAlign: "center",
              backgroundColor: dragging ? "var(--accent)" : file ? "#F0FDF4" : "var(--input-background)",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
            {file ? (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <FileText size={22} color="#059669" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "#065F46" }}>{file.name}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <Upload size={20} color="var(--muted-foreground)" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
                  Drag & drop your file here
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                  or <span style={{ color: "var(--primary)", fontWeight: 500 }}>browse files</span> — CSV only (max 5 MB)
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", backgroundColor: "var(--muted)", borderRadius: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>Need a template?</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>Pre-formatted CSV with all required columns</div>
            </div>
            <button style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
              Download
            </button>
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", backgroundColor: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
              <AlertCircle size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#991B1B", lineHeight: 1.5 }}>{error}</div>
            </div>
          )}

          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", backgroundColor: result.failed > 0 ? "#FFFBEB" : "#F0FDF4", borderRadius: 8, border: `1px solid ${result.failed > 0 ? "#FDE68A" : "#BBF7D0"}` }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: result.failed > 0 ? "#92400E" : "#065F46" }}>
                Imported {result.created} {entityLabel.toLowerCase()}{result.created !== 1 ? "s" : ""}{result.failed > 0 ? ` · ${result.failed} row${result.failed !== 1 ? "s" : ""} failed` : ""}
              </div>
              {result.errors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 140, overflowY: "auto" }}>
                  {result.errors.map((er, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#92400E" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>Row {er.row}:</span> {er.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              disabled={!file || submitting}
              onClick={submit}
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px",
                borderRadius: 6, border: "none",
                backgroundColor: file && !submitting ? "#059669" : "var(--muted)",
                color: file && !submitting ? "#fff" : "var(--muted-foreground)",
                cursor: file && !submitting ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
                transition: "background-color 0.15s",
              }}
            >
              <Upload size={14} /> {submitting ? "Importing…" : "Submit for Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Menu ─────────────────────────────────────────────────────────────────

function AddMenu({ entityLabel, onManual, onImport }: {
  entityLabel: string;
  onManual: () => void;
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items = [
    {
      icon: <ClipboardList size={16} />,
      iconColor: "var(--primary)", iconBg: "var(--secondary)",
      label: "Add Manually",
      desc: "Fill in equipment details using the form",
      comingSoon: false,
      onClick: onManual,
    },
    {
      icon: <FileSpreadsheet size={16} />,
      iconColor: "#059669", iconBg: "#ECFDF5",
      label: "Import from File",
      desc: "Upload a CSV, Excel or PDF roster",
      comingSoon: false,
      onClick: onImport,
    },
  ];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
          height: 34, padding: "0 14px", borderRadius: 7, border: "none",
          backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer",
          outline: "none",
        }}
      >
        <Plus size={14} />
        Add {entityLabel}
        <span style={{ width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
        <ChevronDown
          size={13}
          style={{ opacity: 0.85, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          width: 270, backgroundColor: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200,
          padding: 6, display: "flex", flexDirection: "column", gap: 2,
        }}>
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: "9px 10px", borderRadius: 7,
                border: "none", textAlign: "left", cursor: "pointer",
                backgroundColor: "transparent", outline: "none",
                transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                backgroundColor: item.iconBg, color: item.iconColor,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Trucks tab ───────────────────────────────────────────────────────────────

function TrucksTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [rows, setRows]           = useState<TruckRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [modal, setModal]         = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]     = useState<Partial<TruckRow>>({});
  const [deleting, setDeleting]   = useState<TruckRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch]       = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(20);
  const [saving, setSaving]       = useState(false);
  const [fetchKey, setFetchKey]   = useState(0);
  const [toast, setToast]         = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [driverOpts, setDriverOpts] = useState<SelectOpt[]>([]);

  useEffect(() => {
    api.get<any[]>("/drivers").then((drivers) => {
      setDriverOpts((drivers ?? []).map((d) => ({ value: d.id, label: d.name ?? d.name1 ?? d.id })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api.getList<TruckRow>("/trucks", {
      q: debouncedQ || undefined,
      page,
      page_size: pageSize,
    })
      .then(({ items, total: t }) => {
        setRows(items);
        setTotal(t);
        onCountChange(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debouncedQ, page, pageSize, fetchKey]);

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (r: TruckRow) => { setEditing(r); setModal("edit"); };

  const save = async (r: EquipRow) => {
    const d = r as TruckRow;
    const payload = { ...d, driver_id: d.driver_id || null };
    setSaving(true);
    try {
      if (modal === "create") {
        await api.post<TruckRow>("/trucks", payload);
        setModal(null);
        setFetchKey((k) => k + 1);
        setToast({ type: "success", msg: "Truck created successfully" });
      } else {
        await api.put<TruckRow>(`/trucks/${d.id}`, payload);
        setModal(null);
        setFetchKey((k) => k + 1);
        setToast({ type: "success", msg: "Truck updated successfully" });
      }
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/trucks/${deleting.id}`);
      setFetchKey((k) => k + 1);
      setToast({ type: "success", msg: `Truck ${deleting.unit} removed` });
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Delete failed" });
    }
    setDeleting(null);
  };

  if (error) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trucks…"
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 30px",
                borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)",
                color: "var(--foreground)", outline: "none", width: 220,
              }}
            />
          </div>
        </div>
        <AddMenu entityLabel="Truck" onManual={openCreate} onImport={() => setImporting(true)} />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        {loading ? (
          <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
            Loading trucks…
          </div>
        ) : (
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={120}>Unit #</TH>
              <TH width={200}>Driver</TH>
              <TH width={150}>Make</TH>
              <TH width={160}>Model</TH>
              <TH width={220}>VIN</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{(page - 1) * pageSize + i + 1}</TD>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>
                    {r.unit}
                  </span>
                </td>
                <TD>{r.driver || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>}</TD>
                <TD>{r.make}</TD>
                <TD>{r.model}</TD>
                <TD mono>{r.vin}</TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(r)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(r)} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  No trucks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
      </div>

      <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

      {(modal === "create" || modal === "edit") && (
        <EquipModal title={modal === "create" ? "Add Truck" : "Edit Truck"} row={editing} onClose={() => setModal(null)} onSave={save} saving={saving} driverOpts={driverOpts} />
      )}
      {deleting && <DeleteConfirm label={deleting.unit} onClose={() => setDeleting(null)} onConfirm={del} />}
      {importing && <ImportModal entityLabel="Truck" endpoint="/trucks/import" onClose={() => setImporting(false)} onImported={() => setFetchKey((k) => k + 1)} />}
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Trailers tab ─────────────────────────────────────────────────────────────

function TrailersTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [rows, setRows]           = useState<TrailerRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [modal, setModal]         = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]     = useState<Partial<TrailerRow>>({});
  const [deleting, setDeleting]   = useState<TrailerRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch]       = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(20);
  const [saving, setSaving]       = useState(false);
  const [fetchKey, setFetchKey]   = useState(0);
  const [toast, setToast]         = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [driverOpts, setDriverOpts] = useState<SelectOpt[]>([]);

  useEffect(() => {
    api.get<any[]>("/drivers").then((drivers) => {
      setDriverOpts((drivers ?? []).map((d) => ({ value: d.id, label: d.name ?? d.name1 ?? d.id })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api.getList<TrailerRow>("/trailers", {
      q: debouncedQ || undefined,
      page,
      page_size: pageSize,
    })
      .then(({ items, total: t }) => {
        setRows(items);
        setTotal(t);
        onCountChange(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debouncedQ, page, pageSize, fetchKey]);

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (r: TrailerRow) => { setEditing(r); setModal("edit"); };

  const save = async (r: EquipRow) => {
    const d = r as TrailerRow;
    const payload = { ...d, driver_id: d.driver_id || null };
    setSaving(true);
    try {
      if (modal === "create") {
        await api.post<TrailerRow>("/trailers", payload);
        setModal(null);
        setFetchKey((k) => k + 1);
        setToast({ type: "success", msg: "Trailer created successfully" });
      } else {
        await api.put<TrailerRow>(`/trailers/${d.id}`, payload);
        setModal(null);
        setFetchKey((k) => k + 1);
        setToast({ type: "success", msg: "Trailer updated successfully" });
      }
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/trailers/${deleting.id}`);
      setFetchKey((k) => k + 1);
      setToast({ type: "success", msg: `Trailer ${deleting.unit} removed` });
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Delete failed" });
    }
    setDeleting(null);
  };

  if (error) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444", fontSize: 13 }}>
      {error}
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trailers…"
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 30px",
                borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--card)",
                color: "var(--foreground)", outline: "none", width: 220,
              }}
            />
          </div>
        </div>
        <AddMenu entityLabel="Trailer" onManual={openCreate} onImport={() => setImporting(true)} />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        {loading ? (
          <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
            Loading trailers…
          </div>
        ) : (
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <TH width={40}>#</TH>
              <TH width={130}>Unit #</TH>
              <TH width={200}>Driver</TH>
              <TH width={150}>Make</TH>
              <TH width={200}>Model</TH>
              <TH width={220}>VIN</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{(page - 1) * pageSize + i + 1}</TD>
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#5B21B6", backgroundColor: "#EDE9FE", borderRadius: 4, padding: "2px 8px" }}>
                    {r.unit}
                  </span>
                </td>
                <TD>{r.driver || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>}</TD>
                <TD>{r.make}</TD>
                <TD>{r.model}</TD>
                <TD mono>{r.vin}</TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(r)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(r)} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "32px 24px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  No trailers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
      </div>

      <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

      {(modal === "create" || modal === "edit") && (
        <EquipModal title={modal === "create" ? "Add Trailer" : "Edit Trailer"} row={editing} onClose={() => setModal(null)} onSave={save} saving={saving} driverOpts={driverOpts} />
      )}
      {deleting && <DeleteConfirm label={deleting.unit} onClose={() => setDeleting(null)} onConfirm={del} />}
      {importing && <ImportModal entityLabel="Trailer" endpoint="/trailers/import" onClose={() => setImporting(false)} onImported={() => setFetchKey((k) => k + 1)} />}
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

type TabId = "trucks" | "trailers";

export function EquipmentsPage() {
  const [tab, setTab] = useState<TabId>("trucks");
  const [truckCount,   setTruckCount]   = useState<number | null>(null);
  const [trailerCount, setTrailerCount] = useState<number | null>(null);

  const tabs: { id: TabId; label: string; count: number | null; icon: React.ReactNode; color: string; bg: string }[] = [
    { id: "trucks",   label: "Trucks",   count: truckCount,   icon: <Truck     size={15} />, color: "#1D4ED8", bg: "#DBEAFE" },
    { id: "trailers", label: "Trailers", count: trailerCount, icon: <Container size={15} />, color: "#5B21B6", bg: "#EDE9FE" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      {/* Tab bar */}
      <div style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 18px",
                fontFamily: "var(--font-sans)", fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? t.color : "var(--muted-foreground)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${t.color}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                marginBottom: -1,
              }}
            >
              <span style={{ opacity: active ? 1 : 0.55 }}>{t.icon}</span>
              {t.label}
              {t.count !== null && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  color: active ? t.color : "var(--muted-foreground)",
                  backgroundColor: active ? t.bg : "var(--muted)",
                  borderRadius: 10, padding: "1px 7px",
                }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content with padding + card */}
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          <div style={{ display: tab === "trucks" ? "contents" : "none" }}>
            <TrucksTab onCountChange={setTruckCount} />
          </div>
          <div style={{ display: tab === "trailers" ? "contents" : "none" }}>
            <TrailersTab onCountChange={setTrailerCount} />
          </div>
        </div>
      </div>
    </div>
  );
}

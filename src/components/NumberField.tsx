import { useState } from "react";
import { X } from "lucide-react";

// The app's one box for typing a number — money, miles, a percent. It stands in for the
// browser's number input everywhere: no spinner arrows, no value changing under the scroll
// wheel. A zero shows as an empty box with a "0" placeholder, so typing replaces it instead
// of producing "05". While focused it holds exactly what was typed; on leaving it shows the
// number with thousands separators.
export function NumberField({ value, onChange, prefix, suffix, decimals = 2, max, label, placeholder = "0", busy = false, onClear, autoFocus = false, invalid = false, id }: {
  value: number | undefined;
  onChange: (n: number) => void;
  prefix?: string; suffix?: string;
  decimals?: number;        // 0 for whole numbers (miles)
  max?: number;             // typing past it stops at it (100 for a percent)
  label: string;
  placeholder?: string;
  busy?: boolean;           // a background calculation is filling this in
  onClear?: () => void;     // shows an × that empties the field
  autoFocus?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const shown = value ? value.toLocaleString("en-US", { maximumFractionDigits: decimals }) : "";
  const clearable = !!onClear && !!value && !busy;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, padding: "0 10px", width: "100%", height: 36, borderRadius: 8, boxSizing: "border-box",
      border: `1px solid ${invalid ? "#EF4444" : focused ? "var(--primary)" : "var(--border)"}`,
      boxShadow: focused ? "0 0 0 3px var(--primary-soft)" : "none",
      backgroundColor: "var(--card)", color: "var(--foreground)", transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      {prefix && <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", flexShrink: 0 }}>{prefix}</span>}
      <input
        id={id}
        value={focused ? text : shown}
        aria-label={label}
        placeholder={placeholder}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={(e) => { setText(value ? String(value) : ""); setFocused(true); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          let t = e.target.value.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, "");
          // One decimal point, and no more decimals than the field holds.
          const dot = t.indexOf(".");
          if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
          if (max !== undefined && Number(t) > max) t = String(max);
          setText(t);
          onChange(Number(t) || 0);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "transparent", padding: 0, color: "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}
      />
      {suffix && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", flexShrink: 0 }}>{suffix}</span>}
      {busy && <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--muted-foreground)", animation: "spin 0.7s linear infinite", flexShrink: 0, boxSizing: "border-box" }} />}
      {clearable && (
        <button type="button" aria-label={`Clear ${label.toLowerCase()}`} title="Clear" onClick={onClear}
          style={{ display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

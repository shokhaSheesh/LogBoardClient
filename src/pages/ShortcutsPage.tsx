import { useState } from "react";
import { useNavigate } from "react-router";
import { Keyboard, MousePointerClick, PackagePlus, Rows3, SquarePen } from "lucide-react";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { useLayer } from "../lib/layers";
import { isMac } from "../lib/platform";
import { SHORTCUT_SECTIONS } from "../components/Shortcuts";

// Keyboard shortcuts (/workspace/shortcuts, or ? from anywhere): the sections down the left,
// the picked one's shortcuts on the right, for Mac or Windows — this computer's by default.

const ICONS: Record<string, React.ReactNode> = {
  anywhere: <MousePointerClick size={15} />,
  forms: <SquarePen size={15} />,
  load: <PackagePlus size={15} />,
  pages: <Rows3 size={15} />,
};

export function ShortcutsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreateLoad = hasPerm(user, "loads", "create");
  const [os, setOs] = useState<"mac" | "win">(isMac ? "mac" : "win");
  const sections = SHORTCUT_SECTIONS
    .filter((s) => !s.needs || canCreateLoad)
    .map((s) => ({ ...s, rows: s.rows.filter((r) => !r.needs || canCreateLoad) }));
  const [picked, setPicked] = useState(sections[0].id);
  const section = sections.find((s) => s.id === picked) ?? sections[0];

  // Esc goes back to wherever ? was pressed.
  useLayer(true, { onEscape: () => navigate(-1), page: true });

  const kbd: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 26, padding: "0 8px", boxSizing: "border-box",
    fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)",
    backgroundColor: "var(--card)", border: "1px solid var(--border)", borderBottomWidth: 2, borderRadius: 6, whiteSpace: "nowrap",
  };

  return (
    <div style={{ height: "100%", boxSizing: "border-box", overflowY: "auto", padding: "20px 24px", backgroundColor: "var(--background)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}>
            <Keyboard size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Keyboard shortcuts</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Work faster without the mouse. Press <kbd style={{ ...kbd, height: 20, minWidth: 20, fontSize: 11, padding: "0 5px" }}>?</kbd> on any page to come back here.</div>
          </div>
          <div role="radiogroup" aria-label="Keys for" style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: 9, backgroundColor: "var(--muted)" }}>
            {([["mac", "Mac"], ["win", "Windows"]] as const).map(([v, label]) => (
              <button key={v} role="radio" aria-checked={os === v} onClick={() => setOs(v)}
                style={{ height: 30, padding: "0 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, backgroundColor: os === v ? "var(--card)" : "transparent", color: os === v ? "var(--foreground)" : "var(--muted-foreground)", boxShadow: os === v ? "0 1px 2px rgba(0,0,0,0.12)" : "none" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]" style={{ gap: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", minHeight: 420 }}>
          {/* The sections, down the left */}
          <nav aria-label="Shortcut sections" style={{ padding: 8, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2, backgroundColor: "color-mix(in srgb, var(--muted) 45%, transparent)" }}>
            {sections.map((s) => {
              const on = s.id === section.id;
              return (
                <button key={s.id} onClick={() => setPicked(s.id)} aria-current={on ? "true" : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: on ? 600 : 500, color: on ? "var(--primary)" : "var(--foreground)", backgroundColor: on ? "var(--primary-soft)" : "transparent" }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <span style={{ display: "flex", color: on ? "var(--primary)" : "var(--muted-foreground)" }}>{ICONS[s.id]}</span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted-foreground)" }}>{s.rows.length}</span>
                </button>
              );
            })}
          </nav>

          {/* The picked section */}
          <section aria-label={section.title} style={{ padding: "18px 22px", minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>{section.title}</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2, marginBottom: 12 }}>{section.blurb}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {section.rows.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>{r.what}</div>
                    {r.note && <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>{r.note}</div>}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {(os === "mac" ? r.mac : r.win).map((k, j, all) => (
                      <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <kbd style={kbd}>{k}</kbd>
                        {j < all.length - 1 && k !== "↑" && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>+</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { anyLayerOpen } from "../lib/layers";

// The app-wide single keys, and the list of every shortcut (shown on /workspace/shortcuts).
//
//   ⌘/Ctrl + Shift + L — a new load, from any page. Three keys, so it can't happen by a slip
//     (⌘/Ctrl + N is the browser's "new window" and can't be taken over).
//   ? — the shortcuts page.
//
// Neither fires while something is open over the page (a form someone is filling in would be
// left behind), and ? not while someone is typing in a field.

/** Opens the shortcuts page from anywhere (a menu item, the search box's footer). */
export const SHOW_SHORTCUTS = "brelo:show-shortcuts";
export const showShortcuts = () => window.dispatchEvent(new Event(SHOW_SHORTCUTS));

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable=true]";

export interface ShortcutRow { what: string; mac: string[]; win: string[]; note?: string; needs?: "loads.create" }
export interface ShortcutSection { id: string; title: string; blurb: string; rows: ShortcutRow[]; needs?: "loads.create" }

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  { id: "anywhere", title: "Anywhere", blurb: "Work from any page.", rows: [
    { what: "Search loads", mac: ["⌘", "K"], win: ["Ctrl", "K"], note: "by load #, broker or driver" },
    { what: "New load", mac: ["⌘", "Shift", "L"], win: ["Ctrl", "Shift", "L"], needs: "loads.create" },
    { what: "Keyboard shortcuts", mac: ["?"], win: ["?"], note: "this page" },
  ] },
  { id: "forms", title: "Forms and pop-ups", blurb: "Any form that opens over the page: drivers, trucks, users, requests…", rows: [
    { what: "Save", mac: ["Enter"], win: ["Enter"], note: "in a comment box, Enter is a new line" },
    { what: "Save from anywhere in the form", mac: ["⌘", "Enter"], win: ["Ctrl", "Enter"], note: "comment box included" },
    { what: "Save", mac: ["⌘", "S"], win: ["Ctrl", "S"] },
    { what: "Close", mac: ["Esc"], win: ["Esc"], note: "asks first when something is unsaved; a dropdown or calendar closes before the form" },
    { what: "Cancel a delete or confirm", mac: ["Esc"], win: ["Esc"], note: "Enter never confirms one — that takes a click" },
  ] },
  { id: "load", title: "Load form", blurb: "Creating or editing a load.", needs: "loads.create", rows: [
    { what: "Save the load", mac: ["⌘", "S"], win: ["Ctrl", "S"] },
    { what: "Save the load", mac: ["⌘", "Enter"], win: ["Ctrl", "Enter"] },
    { what: "Back to Loads", mac: ["Esc"], win: ["Esc"], note: "asks first when unsaved" },
  ] },
  { id: "pages", title: "Pages and tables", blurb: "Moving around lists and detail pages.", rows: [
    { what: "Back from a driver, a load or a KPI week", mac: ["Esc"], win: ["Esc"] },
    { what: "Move up and down the rows of a table", mac: ["↑", "↓"], win: ["↑", "↓"], note: "Loads, Drivers, Equipments, Payouts, Compensations, KPI table" },
  ] },
];

/** The keys themselves: mounted once in the layout. */
export function Shortcuts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreateLoad = hasPerm(user, "loads", "create");

  useEffect(() => {
    const show = () => navigate("/workspace/shortcuts");
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || anyLayerOpen()) return;
      // A new load: ⌘/Ctrl + Shift + L — by the key's place (KeyL), so a keyboard layout or
      // Caps Lock can't change what it is.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyL") {
        if (!canCreateLoad) return;
        e.preventDefault();
        navigate("/workspace/loads/new");
        return;
      }
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement | null)?.closest?.(TYPING)) return;
      if (e.key === "?") { e.preventDefault(); show(); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHOW_SHORTCUTS, show);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(SHOW_SHORTCUTS, show); };
  }, [canCreateLoad, navigate]);

  return null;
}

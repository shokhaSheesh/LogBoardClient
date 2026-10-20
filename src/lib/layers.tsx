import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The app's keyboard for whatever is open on top: Esc closes it, Enter saves it.
//
// Everything that floats over the page — a modal, a dropdown, a calendar, a confirm —
// registers here while it is open, so they stack in the order they opened. One key listener
// acts on the top of the stack only: Esc closes the dropdown first, then the calendar, then
// the modal, one press each — never two at once, which separate listeners used to do.
//
// Enter (and ⌘/Ctrl + Enter, and ⌘/Ctrl + S) go to the top layer's onSubmit, when it has one —
// a form's Save. A full-page form (the load form) can turn plain Enter off and keep the other two.
// Plain Enter is left alone where it already means something: a new line in a comment box,
// pressing a focused button or link, picking from a list. ⌘/Ctrl + Enter saves from anywhere,
// comment box included.
//
// A component that handles a key itself calls preventDefault (or stops it), and this listener
// steps aside — so a field's own Enter or Esc always wins.

export interface LayerKeys {
  // Esc: close this layer. Left out, Esc does nothing while it is on top.
  onEscape?: () => void;
  // Enter, ⌘/Ctrl + Enter, ⌘/Ctrl + S: save this layer. Only forms have one.
  onSubmit?: () => void;
  // false: plain Enter doesn't save (a long page form, where Enter in one field shouldn't
  // send the whole thing). ⌘/Ctrl + Enter and ⌘/Ctrl + S still do.
  enterSubmits?: boolean;
  // A whole view rather than something over it (a driver's page, the load form): Esc still
  // goes back from it, but it doesn't count as "something open" — single-key shortcuts and
  // the table arrows keep working on it.
  page?: boolean;
}

interface Layer { keys: React.MutableRefObject<LayerKeys> }
const stack: Layer[] = [];
let listening = false;

// Where a plain Enter already does something of its own.
const ENTER_OWNED = "textarea, button, a[href], select, summary, [role=button], [role=option], [role=menuitem], [role=tab], [role=radio], [role=switch], [contenteditable=''], [contenteditable=true]";

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1]?.keys.current;
  if (!top) return;
  if (e.key === "Escape") {
    if (top.onEscape) { e.preventDefault(); top.onEscape(); }
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  // ⌘/Ctrl + S saves the form on top instead of offering to save the web page.
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
    if (top.onSubmit) { e.preventDefault(); top.onSubmit(); }
    return;
  }
  if (e.key === "Enter" && top.onSubmit) {
    if (!mod) {
      if (e.shiftKey || e.altKey || top.enterSubmits === false) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(ENTER_OWNED)) return;
    }
    e.preventDefault();
    top.onSubmit();
  }
}

/** Whether anything is open over the page — a dropdown, a form, a confirm. */
export const anyLayerOpen = () => stack.some((l) => !l.keys.current.page);

/** Puts a layer on the stack while `open`. The handlers are read when a key comes, so they're never stale. */
export function useLayer(open: boolean, keys: LayerKeys) {
  const ref = useRef(keys);
  ref.current = keys;
  useEffect(() => {
    if (!open) return;
    if (!listening) { window.addEventListener("keydown", onKey); listening = true; }
    const layer: Layer = { keys: ref };
    stack.push(layer);
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}

// ─── Unsaved changes ───────────────────────────────────────────────────────────

let ask: ((resolve: (discard: boolean) => void) => void) | null = null;

/** Asks "Discard your changes?"; resolves true to discard, false to keep editing. */
export function confirmDiscard(): Promise<boolean> {
  return new Promise((resolve) => (ask ? ask(resolve) : resolve(window.confirm("Discard your changes?"))));
}

/** Closes, asking "Discard your changes?" first when there are any. */
export function closeAsking(dirty: boolean, onClose: () => void) {
  if (!dirty) { onClose(); return; }
  void confirmDiscard().then((discard) => { if (discard) onClose(); });
}

/**
 * A dialog's keys: Esc closes it — asking first when it holds unsaved changes — and Enter
 * saves it. Nothing happens while it is busy (saving). Returns the same "close, asking first"
 * for the dialog's own ✕, so the button and the key agree.
 */
export function useDialogKeys({ onClose, onSave, dirty = false, busy = false, open = true }: {
  onClose: () => void; onSave?: () => void; dirty?: boolean; busy?: boolean; open?: boolean;
}) {
  const requestClose = () => { if (!busy) closeAsking(dirty, onClose); };
  useLayer(open, {
    onEscape: requestClose,
    onSubmit: onSave ? () => { if (!busy) onSave(); } : undefined,
  });
  return requestClose;
}

/**
 * Spread on a dialog's backdrop: a click on the dark area around the dialog closes it, like
 * its ✕ and Esc — pass the same close (requestClose for a form, so unsaved changes are asked
 * about, and nothing happens while it saves). Only a press that starts AND ends on the
 * backdrop counts: selecting text in a field and letting go outside it keeps the dialog open.
 */
export function backdropClose(close: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.dataset.pressed = e.target === e.currentTarget ? "1" : ""; },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const pressed = e.currentTarget.dataset.pressed === "1";
      e.currentTarget.dataset.pressed = "";
      if (pressed && e.target === e.currentTarget) close();
    },
  };
}

/** Mounted once at the app root: the "Discard your changes?" dialog every form shares. */
export function DiscardHost() {
  const [pending, setPending] = useState<((discard: boolean) => void) | null>(null);
  useEffect(() => {
    ask = (resolve) => setPending(() => resolve);
    return () => { ask = null; };
  }, []);
  const answer = (discard: boolean) => { pending?.(discard); setPending(null); };
  // Esc keeps editing; Enter does nothing — throwing work away takes a deliberate click.
  useLayer(!!pending, { onEscape: () => answer(false) });
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (pending) keepRef.current?.focus(); }, [pending]);
  if (!pending) return null;

  const btn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, cursor: "pointer" };
  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-label="Discard your changes?" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, maxWidth: "calc(100vw - 32px)", padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>Discard your changes?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 18 }}>
          What you changed in this form hasn't been saved.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button ref={keepRef} onClick={() => answer(false)} style={{ ...btn, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }}>Keep editing</button>
          <button onClick={() => answer(true)} style={{ ...btn, border: "none", backgroundColor: "#EF4444", color: "#fff" }}>Discard</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

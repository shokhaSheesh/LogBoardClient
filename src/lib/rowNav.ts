import { useEffect, useRef, useState } from "react";
import { anyLayerOpen } from "./layers";

// ↑ / ↓ move a highlight through a table's rows, the way a list in a desktop app does.
//
// The table hands the hook its row count and puts `ref` on its <tbody> and `row(i)` on each
// row; the look is index.css's [data-kbd-active]. The keys do nothing while someone is typing
// in a field, while anything is open over the page (a dropdown, a form, a confirm), or while
// the table isn't on screen — a page that keeps two tables mounted and shows one (the Solo /
// Team tabs) only ever moves the one you can see. The highlight starts afresh when the rows
// change (a new page, a filter).

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable=true]";

export function useRowNav(count: number, resetKey?: unknown) {
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLTableSectionElement>(null);

  useEffect(() => { setActive(null); }, [count, resetKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if ((e.target as HTMLElement | null)?.closest?.(TYPING) || anyLayerOpen()) return;
      const body = ref.current;
      if (!body || body.offsetParent === null || count === 0) return;
      e.preventDefault(); // the arrow moves the highlight, not the page
      const down = e.key === "ArrowDown";
      setActive((i) => (i == null ? 0 : Math.max(0, Math.min(count - 1, i + (down ? 1 : -1)))));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  useEffect(() => {
    if (active == null) return;
    ref.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return {
    ref,
    row: (i: number) => ({ "data-row": i, "data-kbd-active": active === i ? "true" : undefined }),
  };
}

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Our own left–right scroll bar for wide tables.
//
// The browser's horizontal bar sits at the bottom of the scrolling box: on a long table you
// have to go all the way down to find it, and on a Mac it is hidden until you scroll. This
// one is always on screen while the table is wider than its box, and sits where you can
// reach it: under the box (ScrollPane) or pinned to the bottom of the view while a section is
// on screen (ScrollX). The native horizontal bar is hidden (.hx in index.css); wheel,
// trackpad and shift-scroll keep working because the box itself still scrolls.

type Metrics = { visible: boolean; left: number; width: number };

function useMetrics(target: React.RefObject<HTMLElement | null>, track: React.RefObject<HTMLElement | null>) {
  const [m, setM] = useState<Metrics>({ visible: false, left: 0, width: 0 });
  const measure = useCallback(() => {
    const el = target.current, tr = track.current;
    if (!el) return;
    const { scrollWidth: sw, clientWidth: cw, scrollLeft: sl } = el;
    if (sw <= cw + 1) { setM((p) => (p.visible ? { visible: false, left: 0, width: 0 } : p)); return; }
    const tw = tr?.clientWidth || cw;
    const width = Math.max(40, (cw / sw) * tw);
    const left = (sl / (sw - cw)) * (tw - width);
    setM((p) => (p.visible && Math.abs(p.left - left) < 0.5 && Math.abs(p.width - width) < 0.5 ? p : { visible: true, left, width }));
  }, [target, track]);

  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    let raf = 0;
    const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // The table's width changes with its data (rows arrive, a column appears), not only with
    // the window, so watch the content as well as the box.
    const ro = new ResizeObserver(soon);
    ro.observe(el);
    const watchKids = () => { for (const k of Array.from(el.children)) ro.observe(k); };
    watchKids();
    const mo = new MutationObserver(() => { watchKids(); soon(); });
    mo.observe(el, { childList: true, subtree: true });
    if (track.current) ro.observe(track.current);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", measure); ro.disconnect(); mo.disconnect(); };
  }, [target, track, measure]);

  return m;
}

/** The bar itself, driving `target`'s horizontal scroll. Draws nothing when nothing overflows. */
export function HScrollBar({ target, sticky = false }: { target: React.RefObject<HTMLElement | null>; sticky?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const m = useMetrics(target, track);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);
  const start = useRef({ x: 0, left: 0 });

  const onThumbDown = (e: React.PointerEvent) => {
    const el = target.current;
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, left: el.scrollLeft };
    setDrag(true);
  };
  const onThumbMove = (e: React.PointerEvent) => {
    const el = target.current, tr = track.current;
    if (!drag || !el || !tr) return;
    const room = tr.clientWidth - m.width;
    if (room <= 0) return;
    el.scrollLeft = start.current.left + ((e.clientX - start.current.x) / room) * (el.scrollWidth - el.clientWidth);
  };
  const onThumbUp = () => setDrag(false);
  // A click on the track beside the thumb moves most of a screen that way, as a native bar does.
  const onTrackDown = (e: React.PointerEvent) => {
    const el = target.current, tr = track.current;
    if (!el || !tr) return;
    const x = e.clientX - tr.getBoundingClientRect().left;
    el.scrollBy({ left: (x < m.left ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (!m.visible) return <div ref={track} style={{ height: 0 }} />;
  const active = drag || hover;
  return (
    <div
      aria-hidden
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0, height: 14, padding: "0 10px", display: "flex", alignItems: "center",
        backgroundColor: "var(--card)", borderTop: "1px solid var(--border)",
        ...(sticky ? { position: "sticky", bottom: 0, left: 0, zIndex: 25 } : null),
      }}
    >
      <div ref={track} onPointerDown={onTrackDown} style={{ position: "relative", flex: 1, height: 14, cursor: "pointer" }}>
        <div
          onPointerDown={onThumbDown} onPointerMove={onThumbMove} onPointerUp={onThumbUp} onPointerCancel={onThumbUp}
          style={{
            position: "absolute", top: "50%", left: m.left, width: m.width,
            height: active ? 8 : 6, transform: "translateY(-50%)", borderRadius: 99,
            backgroundColor: drag ? "var(--primary)" : active ? "color-mix(in srgb, var(--muted-foreground) 70%, transparent)" : "color-mix(in srgb, var(--muted-foreground) 40%, transparent)",
            transition: "height 0.12s, background-color 0.12s", cursor: drag ? "grabbing" : "grab", touchAction: "none",
          }}
        />
      </div>
    </div>
  );
}

// The thin-scrollbar props are dropped from a box that hides its horizontal bar: in Chrome they
// switch off the ::-webkit-scrollbar rules that do the hiding. index.css styles the vertical
// bar to match instead.
function withoutScrollbarProps(style?: React.CSSProperties): React.CSSProperties {
  const { scrollbarWidth: _w, scrollbarColor: _c, ...rest } = style ?? {};
  return rest;
}

function setRef<T>(ref: React.ForwardedRef<T>, v: T | null) {
  if (typeof ref === "function") ref(v);
  else if (ref) ref.current = v;
}

/**
 * A page's scrolling box (both ways) with our bar fixed underneath it. Drop-in for the
 * `flex: 1, overflow: auto` div a page's table lives in; `style` goes on the scrolling box.
 */
export const ScrollPane = forwardRef<HTMLDivElement, { style?: React.CSSProperties; children?: React.ReactNode }>(
  function ScrollPane({ style, children }, ref) {
    const inner = useRef<HTMLDivElement | null>(null);
    useEffect(() => () => setRef(ref, null), [ref]);
    return (
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          ref={(el) => { inner.current = el; setRef(ref, el); }}
          className="hx"
          style={{ ...withoutScrollbarProps(style), flex: 1, minHeight: 0 }}
        >
          {children}
        </div>
        <HScrollBar target={inner} />
      </div>
    );
  },
);

/**
 * A section that scrolls left–right on its own inside a page that scrolls up–down (a team's
 * table in the "By team" view): the bar sticks to the bottom of the view while the section is
 * on screen. Its container must not clip with `overflow: hidden` (use `clip`), or the bar
 * can't stick.
 */
export function ScrollX({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  const inner = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={inner} className="hx" style={{ ...style, overflowX: "auto", overflowY: "hidden" }}>{children}</div>
      <HScrollBar target={inner} sticky />
    </>
  );
}

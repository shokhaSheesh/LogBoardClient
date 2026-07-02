// Position a fixed-position portal menu relative to its anchor rect, flipping it
// upward when it would overflow the bottom of the viewport, and clamping it so it
// never runs off the right edge.
export function menuPosition(
  rect: DOMRect,
  itemCount: number,
  minWidth = 168,
  itemHeight = 30,
): { top: number; left: number } {
  const menuH = itemCount * itemHeight + 12;
  const openUp = rect.bottom + menuH + 8 > window.innerHeight;
  const top = openUp ? Math.max(8, rect.top - menuH - 5) : rect.bottom + 5;
  const left = Math.min(rect.left, window.innerWidth - minWidth - 8);
  return { top, left };
}

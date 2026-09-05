"use client";
import { useEffect, useRef, useState } from "react";

// Tracks a DOM node's own content width via ResizeObserver -- used for the
// board's column count, which should react to the sidebar opening/closing
// as well as the window resizing, not just the viewport (which Tailwind's
// responsive prefixes are keyed to).
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

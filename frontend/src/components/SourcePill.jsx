"use client";
import { cx } from "@/lib/cx";
import { srcColor, srcName } from "@/lib/format";

// The one place a source's colour and name are actually rendered together --
// every row (list view, tracker cards) and every board column heading uses
// this, so a source reads as the same badge everywhere on the page.
export default function SourcePill({ source, size = "sm" }) {
  const c = srcColor(source);
  return (
    <span
      className={cx(
        "flex-none rounded-full font-bold leading-[1.5] text-white",
        size === "md" ? "px-2 py-0.5 text-[12px]" : "px-1.5 py-px text-[11px]",
      )}
      style={{ background: c }}
    >
      {srcName(source)}
    </span>
  );
}

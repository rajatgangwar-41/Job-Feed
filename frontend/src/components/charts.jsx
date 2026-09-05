"use client";
import { cx } from "@/lib/cx";

// Chart primitives, shared by every panel in the Graph tab so the marks stay
// identical across them: bars capped thin with a 4px rounded data-end and a
// square baseline, hairline recessive chrome, a 2px surface gap doing the
// separating instead of a stroke, and a hover tooltip on every mark.

// Hover layer. Pure CSS -- the wrapper is the hit target (deliberately
// larger than the mark), and the bubble is clipped by nothing because the
// panels do not hide overflow.
export function Hoverable({ label, className, style, children }) {
  return (
    <div className={cx("group/mark relative", className)} style={style}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] leading-tight text-text shadow-[var(--shadow-pop)] group-hover/mark:block"
      >
        {label}
      </span>
    </div>
  );
}

// One horizontal bar on a shared scale. `tone` names a chart role, never a
// hex, so both themes come from the token layer.
export function BarRow({ value, max, tone = "bar", label, meta, name, dot, hover }) {
  const pct = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 py-[3px]">
      <div className="flex w-[104px] flex-none items-center gap-1.5 sm:w-[136px]">
        {dot && <span className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} />}
        <span className="truncate text-[12px] font-medium text-text-muted" title={name}>{name}</span>
      </div>
      <Hoverable label={hover || `${name}: ${value}`} className="h-3.5 min-w-0 flex-1">
        <div className="h-full w-full rounded-[4px] bg-viz-track">
          <div
            className={cx("h-full rounded-r-[4px] transition-[width] duration-500",
              tone === "lost" ? "bg-viz-lost" : "bg-viz-bar")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Hoverable>
      <div className="w-7 flex-none text-right text-[12px] font-semibold tabular-nums text-text">{label ?? value}</div>
      <div className="hidden w-[128px] flex-none text-[11px] leading-tight text-text-faint sm:block">{meta}</div>
    </div>
  );
}

// Part-to-whole across one row. Segments are separated by a 2px surface gap
// rather than a border, and interior segments carry no inline label -- they
// have no free end to hold one, so the legend and the table view carry them.
export function StackRow({ segments, max, name, dot, total, hoverPrefix }) {
  const scale = max > 0 ? 100 / max : 0;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="flex items-center gap-2.5 py-[3px]">
      <div className="flex w-[104px] flex-none items-center gap-1.5 sm:w-[136px]">
        {dot && <span className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} />}
        <span className="truncate text-[12px] font-medium text-text-muted" title={name}>{name}</span>
      </div>
      <div className="flex h-3.5 min-w-0 flex-1 items-stretch gap-[2px] rounded-[4px] bg-viz-track">
        {shown.map((s, i) => (
          <Hoverable
            key={s.key} label={`${hoverPrefix || name} — ${s.label}: ${s.value}`}
            className="min-w-0" style={{ width: `${Math.max(2, s.value * scale)}%`, minWidth: 5 }}
          >
            <div
              className={cx("h-full w-full",
                s.key === "won" ? "bg-viz-won" : s.key === "lost" ? "bg-viz-lost" : "bg-viz-active",
                i === 0 && "rounded-l-[4px]", i === shown.length - 1 && "rounded-r-[4px]")}
            />
          </Hoverable>
        ))}
      </div>
      <div className="w-7 flex-none text-right text-[12px] font-semibold tabular-nums text-text">{total}</div>
      <div className="hidden w-[128px] flex-none text-[11px] leading-tight text-text-faint sm:block" />
    </div>
  );
}

// Trend over time. One series, so no legend -- the panel title names it. The
// tallest column is direct-labelled and the rest are left to the tooltip and
// the table view, because a number on every column goes unread.
export function ColumnChart({ points, xLabel, hoverLabel, height = 108 }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const peak = points.reduce((best, p, i) => (p.count > (points[best]?.count ?? -1) ? i : best), 0);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {points.map((p, i) => {
          const pct = (p.count / max) * 100;
          return (
            <Hoverable key={p.ts} label={hoverLabel(p)} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              {p.count > 0 && i === peak && (
                <span className="mb-0.5 text-center text-[10px] font-semibold tabular-nums text-text-dim">{p.count}</span>
              )}
              <div
                className={cx("mx-auto w-full max-w-[24px]",
                  p.count > 0 ? "rounded-t-[4px] bg-viz-bar" : "rounded-none bg-viz-grid")}
                style={{ height: p.count > 0 ? `${Math.max(pct, 4)}%` : 2 }}
              />
            </Hoverable>
          );
        })}
      </div>
      <div className="mt-1 h-px bg-viz-grid" />
      <div className="mt-1 flex gap-[2px]">
        {points.map((p, i) => (
          <div key={p.ts} className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-text-faint">
            {i % 7 === 0 ? xLabel(p) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// A single ratio against its limit: same-ramp track, fill carries the role.
export function Meter({ pct, tone }) {
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-viz-track">
      <div
        className={cx("h-full rounded-full transition-[width] duration-500",
          tone === "won" ? "bg-viz-won" : tone === "lost" ? "bg-viz-lost" : "bg-viz-active")}
        style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }}
      />
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {items.map((it) => (
        <span key={it.key} className="flex items-center gap-1.5 text-[11px] text-text-dim">
          <span className={cx("h-2 w-2 flex-none rounded-sm",
            it.key === "won" ? "bg-viz-won" : it.key === "lost" ? "bg-viz-lost" : "bg-viz-active")} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// The table twin every chart needs, so no value is reachable only by hover.
export function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th key={c} className={cx("py-1.5 pr-3 font-semibold text-text-dim", i === 0 ? "text-left" : "text-right")}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 last:border-0">
              {r.map((cell, ci) => (
                <td key={ci} className={cx("py-1.5 pr-3", ci === 0 ? "text-text-muted" : "text-right tabular-nums text-text")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

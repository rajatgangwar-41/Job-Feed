"use client";
import { useMemo, useState } from "react";
import { appliedPerDay, bySource, funnelRows, jobPaths, rates } from "@/lib/analytics";
import { srcColor, srcName } from "@/lib/format";
import { cx } from "@/lib/cx";
import { BarRow, ColumnChart, DataTable, Legend, Meter, StackRow } from "./charts";
import { IconChart, IconDensity } from "./icons";

const OUTCOMES = [
  { key: "active", label: "In Play" },
  { key: "won", label: "Selected" },
  { key: "lost", label: "Rejected" },
];

// Sub-day gaps show as hours -- a same-day reply rounded to "0d" reads like
// a broken value rather than a fast one.
function fmtWait(d) {
  if (d == null) return "—";
  if (d < 1 / 24) return "<1h";
  if (d < 1) return `${Math.round(d * 24)}h`;
  return `${Math.round(d * 10) / 10}d`;
}

const dayLabel = (ts) => new Date(ts * 1000).toLocaleDateString([], { day: "numeric", month: "short" });
const WINDOW_DAYS = 21;

// Tracker analytics. Four panels, one derivation module (lib/analytics.js),
// and a single Chart/Table switch at the top -- every value a chart shows on
// hover is also in the table, so nothing is reachable only by pointing at it.
export default function GraphView({ allJobs, stages, funnel, history }) {
  const [mode, setMode] = useState("chart");

  const paths = useMemo(() => jobPaths(allJobs, stages, history), [allJobs, stages, history]);
  const rows = useMemo(() => funnelRows(paths, stages, funnel), [paths, stages, funnel]);
  const r = useMemo(() => rates(paths, stages, funnel), [paths, stages, funnel]);
  const perDay = useMemo(() => appliedPerDay(paths, WINDOW_DAYS), [paths]);
  const sources = useMemo(() => bySource(paths, stages), [paths, stages]);

  const rejectedStage = stages.find((s) => s.kind === "rejected");
  const funnelMax = Math.max(1, ...rows.map((x) => x.reached), r.lost);

  if (!paths.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center text-[13px] text-text-dim">
        <IconChart className="mb-1 h-6 w-6 text-text-faint" />
        <div className="font-medium text-text-muted">No Pipeline History Yet</div>
        <div className="max-w-[360px] text-[12px]">Move Some Cards Through The Pipeline Board And Conversion Stats Will Show Up Here.</div>
      </div>
    );
  }

  const isTable = mode === "table";

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 pb-6 pt-3">
      <div className="mx-auto flex max-w-[780px] flex-col gap-3.5">
        {/* One control row above everything it scopes, never inside a card. */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-dim">
            <b className="font-semibold text-text">{r.applications}</b> application{r.applications === 1 ? "" : "s"} tracked
          </span>
          <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            {[["chart", "Chart", IconChart], ["table", "Table", IconDensity]].map(([id, label, Icon]) => (
              <button
                key={id} type="button" onClick={() => setMode(id)}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
                  mode === id ? "bg-accent-soft text-accent-text" : "text-text-dim hover:bg-surface-2 hover:text-text",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Rates, not counts -- the counts are already in the toolbar above
            the tabs, and a share of applications is the thing you cannot get
            by looking at the board. */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Rate label="Response rate" pct={r.respondedPct} tone="active"
            caption={r.appliedStageName ? `${r.responded} of ${r.applications} got past ${r.appliedStageName}` : null} />
          <Rate label={`Reached ${r.finalStageName || "final stage"}`} pct={r.wonPct} tone="won"
            caption={`${r.won} of ${r.applications} applications`} />
          <Rate label="Rejection rate" pct={r.lostPct} tone="lost"
            caption={`${r.lost} of ${r.applications} applications${r.lostNow !== r.lost ? ` · ${r.lostNow} still rejected` : ""}`} />
          <Rate
            label="Median time to reply"
            value={fmtWait(r.medianDaysToMove)}
            caption={r.medianDaysToMove == null ? "No replies recorded yet" : "Applying → next stage"} />
        </div>

        <Panel
          title="Pipeline funnel"
          subtitle="Jobs that have ever reached each stage, including ones later rejected"
        >
          {isTable ? (
            <DataTable
              columns={["Stage", "Ever reached", "Here now", "Rejected here", "Conversion"]}
              rows={[
                ...rows.map((x) => [<Named key={x.stage.id} color={x.stage.color}>{x.stage.name}</Named>,
                  x.reached, x.hereNow, x.diedHere,
                  x.conversion == null ? "—" : `${x.conversion}%`]),
                ...(rejectedStage ? [[<Named key="rej" color={rejectedStage.color}>{rejectedStage.name}</Named>,
                  r.lost, r.lostNow, "—",
                  r.lostPct == null ? "—" : `${r.lostPct}%`]] : []),
              ]}
            />
          ) : (
            <>
              {rows.map((x) => (
                <BarRow
                  key={x.stage.id} name={x.stage.name} dot={x.stage.color}
                  value={x.reached} max={funnelMax}
                  hover={`${x.stage.name}: ${x.reached} reached${x.hereNow ? ` · ${x.hereNow} here now` : ""}${x.diedHere ? ` · ${x.diedHere} rejected here` : ""}`}
                  meta={
                    <>
                      {x.conversion != null && <span className="block">{x.conversion}% of {x.prevName}</span>}
                      {x.hereNow > 0 && <span className="block">{x.hereNow} here now</span>}
                      {x.diedHere > 0 && <span className="block text-viz-lost">{x.diedHere} rejected here</span>}
                    </>
                  }
                />
              ))}
              {rejectedStage && (
                <div className="mt-2 border-t border-border pt-2">
                  <BarRow
                    name={rejectedStage.name} dot={rejectedStage.color} tone="lost"
                    value={r.lost} max={funnelMax}
                    hover={`${rejectedStage.name}: ${r.lost} of ${r.applications} applications ever rejected`}
                    meta={
                      <>
                        {r.lostPct != null && <span className="block">{r.lostPct}% of applications</span>}
                        {r.lostNow !== r.lost && <span className="block">{r.lostNow} here now</span>}
                      </>
                    }
                  />
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Applications sent" subtitle={`Per day, last ${WINDOW_DAYS} days`}>
          {isTable ? (
            <DataTable
              columns={["Day", "Applications"]}
              rows={perDay.filter((p) => p.count > 0).map((p) => [dayLabel(p.ts), p.count]).concat(
                perDay.some((p) => p.count > 0) ? [] : [["No applications in this window", 0]])}
            />
          ) : (
            <ColumnChart
              points={perDay} xLabel={(p) => dayLabel(p.ts)}
              hoverLabel={(p) => `${dayLabel(p.ts)}: ${p.count} application${p.count === 1 ? "" : "s"}`}
            />
          )}
        </Panel>

        <Panel
          title="Where applications come from"
          subtitle="Applications per job board, split by how they ended up"
          aside={!isTable && <Legend items={OUTCOMES} />}
        >
          {sources.length === 0 ? (
            <Empty>No applications recorded yet.</Empty>
          ) : isTable ? (
            <DataTable
              columns={["Source", "In play", "Selected", "Rejected", "Total"]}
              rows={sources.map((s) => [
                <Named key={s.source} color={srcColor(s.source)}>{srcName(s.source)}</Named>,
                s.active, s.won, s.lost, s.total])}
            />
          ) : (
            sources.map((s) => (
              <StackRow
                key={s.source} name={srcName(s.source)} dot={srcColor(s.source)}
                total={s.total} max={Math.max(...sources.map((x) => x.total))}
                hoverPrefix={srcName(s.source)}
                segments={OUTCOMES.map((o) => ({ ...o, value: s[o.key] }))}
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

// The table's first column carries the same stage/source dot the chart rows
// do, so a name sits at the identical x in both views -- without it, short
// labels like "OA" visibly jump on every Chart/Table toggle.
function Named({ color, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function Panel({ title, subtitle, aside, children }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-3.5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-text">{title}</h3>
          {subtitle && <p className="mt-px text-[11.5px] text-text-faint">{subtitle}</p>}
        </div>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// A rate is a ratio against a limit, so it gets a meter rather than a bar
// chart of one. Values use proportional figures -- tabular digits make a
// two-digit number look loose at this size.
function Rate({ label, pct, value, tone, caption }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
      <div className="text-[11px] font-medium text-text-dim">{label}</div>
      <div className="mt-0.5 text-[21px] font-semibold leading-none text-text">
        {value ?? (pct == null ? "—" : `${pct}%`)}
      </div>
      {pct != null && <Meter pct={pct} tone={tone} />}
      {caption && <div className="mt-1.5 text-[10.5px] leading-tight text-text-faint">{caption}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <p className="py-4 text-center text-[12px] text-text-faint">{children}</p>;
}

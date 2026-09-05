"use client";
import { useMemo } from "react";
import PipelineBoard from "./PipelineBoard";
import GraphView from "./GraphView";
import { IconCalendar, IconChart, IconCheck, IconClock, IconKanban, IconLayers } from "./icons";
import { cx } from "@/lib/cx";

const TABS = [["pipeline", "Pipeline", IconKanban], ["graph", "Graph", IconChart]];

export default function TrackerView({ allJobs, query, status, stages, funnel, history, tab, onTabChange, onNote, onStage, onStagesChange }) {
  // "In Pipeline" is who is sitting on a live column right now -- the whole
  // point of the board -- so it belongs next to the applied counters rather
  // than only being derivable by adding column headers up by eye.
  const inPipeline = useMemo(() => {
    const live = new Set(stages.filter((s) => s.kind !== "rejected").map((s) => s.id));
    return allJobs.reduce((n, j) => n + (j.stage && live.has(j.stage) ? 1 : 0), 0);
  }, [allJobs, stages]);

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-wrap items-stretch gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
          <Stat value={status.applied_24h} label="Applied In 24h" color="var(--accent)" icon={IconClock} />
          <Stat value={status.applied_7d ?? "–"} label="Applied This Week" color="var(--violet)" icon={IconCalendar} />
          <Stat value={status.applied_all} label="Applied In Total" color="var(--success)" icon={IconCheck} />
          <Stat value={inPipeline} label="In Pipeline" color="var(--warning)" icon={IconLayers} />
        </div>
        <div className="flex flex-none items-stretch gap-0.5 rounded-[10px] border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
          {TABS.map(([id, label, Icon]) => (
            <button
              key={id} type="button" onClick={() => onTabChange(id)}
              className={cx(
                "flex items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors duration-150",
                tab === id ? "bg-accent-soft text-accent-text" : "text-text-dim hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0">
        {tab === "graph"
          ? <GraphView allJobs={allJobs} stages={stages} funnel={funnel} history={history} />
          : <PipelineBoard allJobs={allJobs} query={query} stages={stages} onStage={onStage} onNote={onNote} onStagesChange={onStagesChange} />}
      </div>
    </div>
  );
}

// Tiles share the toolbar row evenly (`flex-1` off a 148px basis) so the
// strip reaches the right edge on a wide window instead of leaving a dead
// gap, and folds to two-up, then one-up, as the window narrows.
function Stat({ value, label, color, icon: Icon }) {
  return (
    <div
      className="flex min-w-0 flex-1 basis-[148px] items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)]"
      style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${color} 7%, var(--surface)), var(--surface) 62%)` }}
    >
      <div
        className="grid h-8 w-8 flex-none place-items-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${color} 15%, var(--surface))`, color }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <b className="block text-[19px] leading-tight font-semibold tabular-nums text-text">{value}</b>
        <span className="block truncate text-[11px] font-medium uppercase tracking-[.04em] text-text-dim" title={label}>{label}</span>
      </div>
    </div>
  );
}

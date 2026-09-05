"use client";
import { ORDER } from "@/lib/constants";
import { ago, absTime } from "@/lib/format";
import { useElementWidth } from "@/hooks/useElementWidth";
import JobRow from "./JobRow";
import SourcePill from "./SourcePill";

export default function BoardView({ jobs, allSources, runsBySource, sourceFilter, cols, compact, isNewFn, focusedUid, filtersActive, onOpen, onMark, onMenu, onFocus, onResetFilters }) {
  const [ref, width] = useElementWidth();

  let srcs = [...ORDER.filter((s) => allSources.has(s)), ...[...allSources].filter((s) => !ORDER.includes(s)).sort()];
  if (sourceFilter.length) srcs = srcs.filter((s) => sourceFilter.includes(s));

  const by = {};
  for (const j of jobs) (by[j.source] ||= []).push(j);

  const n = srcs.length || 1;
  const auto = width >= 1240 ? 4 : width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const colCount = Math.max(1, Math.min(n, cols === "auto" ? auto : Number(cols)));
  const tall = Math.ceil(n / colCount) > 2;

  return (
    <div
      ref={ref}
      className="grid h-full gap-2.5 overflow-auto p-2.5 pb-3.5"
      style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0,1fr))`, gridAutoRows: tall ? "minmax(340px,1fr)" : "minmax(0,1fr)" }}
    >
      {srcs.length === 0 && <div className="col-span-full py-7 text-center text-[12.5px] text-text-dim">No Sources Selected</div>}
      {srcs.map((s) => {
        const items = by[s] || [];
        const run = runsBySource[s];
        return (
          <section key={s} className="flex min-h-0 min-w-0 flex-col rounded-[10px] border border-border bg-surface shadow-[var(--shadow-card)]">
            <h2 className="flex flex-none items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-text-muted">
              <SourcePill source={s} size="md" />
              {run && <span className="font-normal text-text-faint" title={`last polled ${absTime(run.ts)}`}>{ago(run.ts)}</span>}
              <span className="ml-auto font-medium text-text-dim tabular-nums">
                {run && run.error ? <span className="cursor-help font-semibold text-danger" title={run.error}>Error</span> : items.length}
              </span>
            </h2>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5 pb-3">
              {items.length === 0 ? (
                <EmptyState run={run} filtered={filtersActive} onReset={onResetFilters} />
              ) : (
                items.map((j) => (
                  <JobRow
                    key={j.uid} job={j} showSource={false} compact={compact}
                    isNew={isNewFn(j)} focused={j.uid === focusedUid}
                    onOpen={onOpen} onMark={onMark} onMenu={onMenu} onFocus={onFocus}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ run, filtered, onReset }) {
  if (run && run.error) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-7 text-center text-[12.5px] text-text-dim">
        <span className="break-words text-danger" title={run.error}>⚠ {run.error.slice(0, 140)}</span>
        <span className="text-text-dim">Last Tried {ago(run.ts)} Ago</span>
      </div>
    );
  }
  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-7 text-center text-[12.5px] text-text-dim">
        Nothing Matches The Current Filters
        <button type="button" onClick={onReset} className="rounded-md border border-border px-2 py-1 text-xs transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 active:scale-95">Reset Filters</button>
      </div>
    );
  }
  return <div className="px-3 py-7 text-center text-[12.5px] text-text-dim">Nothing Yet</div>;
}

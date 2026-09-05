"use client";
import { memo } from "react";
import { ago, absTime, when, expLabel, hasPay } from "@/lib/format";
import { payText } from "@/lib/salary";
import { cx } from "@/lib/cx";
import SourcePill from "./SourcePill";
import { IconBookmark, IconCheck, IconBan, IconClose, IconUndo, IconMore, IconPin, IconCash, IconExp, IconTag } from "./icons";

// One listing, rendered up to ~250 times on the board at once. Toggling one
// filter re-renders BoardView with a new `jobs` array, but the vast
// majority of individual job objects inside it are the *same* objects as
// before (Dashboard only creates a new one for whichever job you just
// marked) -- memo means only rows whose own props actually changed pay the
// cost of re-rendering, instead of every visible row doing so on every
// filter click.
function JobRow({ job: j, showSource, compact, isNew, focused, onOpen, onMark, onMenu, onFocus }) {
  const state = {
    saved: !!j.saved, applied: !!j.applied, flagged: !!j.flagged, closed: !!j.closed,
    opened: !!j.opened && !j.applied && !j.flagged,
  };
  const stateBox = cx(
    state.applied && "bg-success-soft",
    state.flagged && "bg-danger-soft",
    !state.applied && !state.flagged && state.saved && "bg-warning-soft border-[color-mix(in_srgb,var(--warning)_45%,var(--border))]",
    state.opened && "border-l-[3px] border-l-violet",
    state.closed && "opacity-60",
  );
  const titleColor = cx(
    state.applied && "text-success",
    !state.applied && state.flagged && "text-danger line-through",
    !state.applied && !state.flagged && state.opened && "text-violet",
  );

  const t = when(j);
  const showTags = j.tags && j.tags !== "job" && j.tags !== "internship";

  return (
    <article
      data-uid={j.uid}
      tabIndex={-1}
      onClick={() => onFocus(j.uid)}
      className={cx(
        "group relative flex items-stretch gap-2.5 rounded-lg border border-border bg-surface shadow-[var(--shadow-card)] outline-none",
        "transition-[background-color,border-color,box-shadow] duration-150",
        compact ? "px-2 py-1.5 mb-[3px]" : "px-2.5 py-2.5 mb-1.5",
        "hover:border-border-strong hover:shadow-[var(--shadow-card-hover)]",
        focused && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        stateBox,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className={cx("font-semibold flex items-baseline gap-1.5 min-w-0", compact ? "text-[12.5px]" : "text-[13.5px]")}>
          {showSource && <SourcePill source={j.source} />}
          <a
            href={j.url} target="_blank" rel="noopener" title={j.title}
            // This is a real link and stays one. preventDefault used to run
            // before anything was decided, which threw away every click the
            // browser already had a meaning for -- ctrl/cmd for a background
            // tab, shift for a window, alt to download, middle-click. Those
            // are handed straight back, and the row is still marked opened.
            //
            // A plain left click is taken over only if split view actually
            // opened a window. onOpen returns false when it did not (the
            // preference is off, there is no URL, or a blocker refused the
            // popup) and then the anchor's own target="_blank" runs, so the
            // worst case is an ordinary new tab rather than nothing at all.
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                onOpen(j.uid, null);
                return;
              }
              if (onOpen(j.uid, j.url)) e.preventDefault();
            }}
            className={cx("overflow-hidden text-ellipsis whitespace-nowrap text-text no-underline hover:text-accent-text hover:underline", titleColor)}
          >
            {j.title}
          </a>
          {isNew && <span className="flex-none rounded-full bg-accent px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">New</span>}
        </div>
        <div className={cx("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-text-dim min-w-0", compact ? "mt-px text-[11.5px] flex-nowrap overflow-hidden" : "mt-[3px] text-xs")}>
          <span className="truncate max-w-[280px] font-medium text-text-muted" title={j.company}>{j.company || "—"}</span>
          {/* Company always sits alone on its own line -- location (+ experience) starts fresh below it. */}
          <span className="basis-full h-0" />
          {j.location && (
            <span className="inline-flex min-w-0 max-w-[180px] items-center gap-1" title={j.location}>
              <IconPin className="h-3 w-3 flex-none opacity-75" strokeWidth={1.9} /><span className="truncate">{j.location}</span>
            </span>
          )}
          {expLabel(j.exp_min) && (
            <span className="inline-flex flex-none items-center gap-1 whitespace-nowrap"><IconExp className="h-3 w-3 opacity-75" strokeWidth={1.9} />{expLabel(j.exp_min)}</span>
          )}
          {hasPay(j) && (
            <>
              {/* Forces a line break here (in non-compact/wrapping mode) so pay always starts
                  its own line instead of crowding onto the location/experience line. No-op in
                  compact mode, which is flex-nowrap anyway. */}
              <span className="basis-full h-0" />
              <span className="inline-flex min-w-0 max-w-[200px] items-center gap-1 font-medium text-success" title={j.pay}>
                <IconCash className="h-3 w-3 flex-none" strokeWidth={1.9} /><span className="truncate">{payText(j.pay) ?? j.pay}</span>
              </span>
            </>
          )}
          {showTags && !compact && (
            <span className="max-w-[340px] truncate text-text-faint" title={j.tags}><IconTag className="mr-1 inline h-3 w-3 opacity-75" strokeWidth={1.9} />{j.tags}</span>
          )}
        </div>
      </div>
      <div className="flex flex-none flex-col items-end justify-between">
        <time
          className={cx("whitespace-nowrap text-[11.5px] tabular-nums text-text-dim", !j.posted_at && "text-text-faint")}
          title={(j.posted_at ? "Posted " : "First Seen ") + absTime(t)}
        >
          {!j.posted_at && "~"}{ago(t)}
        </time>
        <div className="flex gap-0.5">
          <RowAction title={`${state.saved ? "Unsave" : "Save"} (S)`} on={state.saved} colorClass="text-warning" activeBg="bg-warning-soft" fillActive onClick={() => onMark(j.uid, "saved", !j.saved)}><IconBookmark className="h-3.5 w-3.5" /></RowAction>
          <RowAction title={`${state.applied ? "Undo Applied" : "Mark Applied"} (A)`} on={state.applied} colorClass="text-success" activeBg="bg-success-soft" onClick={() => onMark(j.uid, "applied", !j.applied)}><IconCheck className="h-3.5 w-3.5" /></RowAction>
          <RowAction title={`${state.flagged ? "Clear Not-Interested" : "Not Interested"} (R)`} on={state.flagged} colorClass="text-danger" activeBg="bg-danger-soft" onClick={() => onMark(j.uid, "flagged", !j.flagged)}><IconBan className="h-3.5 w-3.5" /></RowAction>
          <RowAction title={`${j.closed ? "Restore" : "Hide"} (X)`} onClick={() => onMark(j.uid, "closed", !j.closed)}>{j.closed ? <IconUndo className="h-3.5 w-3.5" /> : <IconClose className="h-3.5 w-3.5" />}</RowAction>
          <RowAction title="More" data-menu-trigger="true" onClick={(e) => onMenu(e, j)}><IconMore className="h-3.5 w-3.5" /></RowAction>
        </div>
      </div>
    </article>
  );
}

function RowAction({ title, on, colorClass, activeBg, fillActive, onClick, children, ...rest }) {
  return (
    <button
      type="button" title={title} onClick={onClick} {...rest}
      className={cx(
        "grid h-6 w-6 place-items-center rounded-full border border-transparent text-text-dim transition duration-150 hover:border-border hover:bg-surface-2 hover:text-text active:scale-90",
        on && colorClass, on && activeBg, on && fillActive && "[&_svg]:fill-current",
      )}
    >
      {children}
    </button>
  );
}

export default memo(JobRow);

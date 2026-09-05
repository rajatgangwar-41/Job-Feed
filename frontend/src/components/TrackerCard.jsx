"use client";
import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { absTime, ago, when } from "@/lib/format";
import { cx } from "@/lib/cx";
import SourcePill from "./SourcePill";
import StageSelect from "./StageSelect";
import JobDetailDialog from "./JobDetailDialog";
import { IconGrip, IconClose, IconNote } from "./icons";

// A board card carries only what you scan a column for -- the role and who
// it is with -- plus the source and the stage control. Location, pay,
// timestamps, tags and the notes editor all live in JobDetailDialog, which
// opens on tap; crowding them onto the face is what made the card noisy and
// the titles truncate.
//
// `overlay` renders the floating drag preview (see DragOverlay in
// PipelineBoard) -- same look, none of the live wiring, since the real card
// underneath keeps it.
export default function TrackerCard({ job: j, stages, onStage, onNote, overlay }) {
  const [detailOpen, setDetailOpen] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: j.uid, data: { job: j }, disabled: overlay,
  });

  const stamp = j.applied_at ? `Applied ${absTime(j.applied_at)}` : `First seen ${absTime(when(j))} · ${ago(when(j))} ago`;

  function openDetail(e) {
    // the drag handle, the remove button and any link inside keep their own
    // click; only the plain face of the card opens the detail
    if (e.target.closest("button, a")) return;
    setDetailOpen(true);
  }

  return (
    <>
      <article
        ref={setNodeRef}
        className={cx(
          "group/card flex-none overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]",
          "transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-[var(--shadow-card-hover)]",
          isDragging && "opacity-30",
          overlay && "w-[272px] rotate-2 border-accent shadow-[var(--shadow-pop)]",
        )}
      >
        <div
          role={overlay ? undefined : "button"} tabIndex={overlay ? undefined : 0}
          onClick={overlay ? undefined : openDetail}
          onKeyDown={overlay ? undefined : (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setDetailOpen(true); }
          }}
          title={overlay ? undefined : `${j.title} — ${stamp}`}
          className={cx(
            "px-2.5 pb-2 pt-2 outline-none",
            !overlay && "cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/50",
          )}
        >
          <div className="flex items-start gap-1">
            <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold leading-[1.35] text-text line-clamp-2">
              {j.title}
            </h3>
            {!overlay && (
              <span className="-mr-1 -mt-0.5 flex flex-none items-center">
                <button
                  type="button" {...attributes} {...listeners} title="Drag To Move"
                  className="cursor-grab touch-none rounded p-1 text-text-faint opacity-45 transition-opacity duration-150 group-hover/card:opacity-100 hover:text-text-dim active:cursor-grabbing"
                >
                  <IconGrip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button" title="Remove From Tracker" onClick={() => onStage(j.uid, null)}
                  className="rounded p-1 text-text-faint opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 hover:bg-danger-soft hover:text-danger"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] font-medium text-text-muted">{j.company || "—"}</div>
        </div>

        <footer className="flex items-center gap-1.5 border-t border-border bg-surface-2/40 px-2.5 py-1.5">
          <SourcePill source={j.source} />
          {!!j.notes && (
            <span title="Has A Note" className="flex-none text-accent-text">
              <IconNote className="h-3.5 w-3.5" />
            </span>
          )}
          {!overlay && (
            <span className="ml-auto flex-none">
              <StageSelect stages={stages} value={j.stage} onChange={(id) => onStage(j.uid, id)} />
            </span>
          )}
        </footer>
      </article>

      {detailOpen && (
        <JobDetailDialog
          job={j} stages={stages} onClose={() => setDetailOpen(false)}
          onStage={onStage} onNote={onNote}
        />
      )}
    </>
  );
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { matchQuery, SORT_FNS } from "@/lib/format";
import { nextStageColor, slugifyStageId } from "@/lib/pipeline";
import { cx } from "@/lib/cx";
import TrackerCard from "./TrackerCard";
import { IconChevronLeft, IconChevronRight, IconClose, IconLayers, IconPlus, IconTrash } from "./icons";

// The Notion-style board: one column per pipeline stage, cards move between
// them by drag-and-drop (or the card's own stage dropdown, for anyone who'd
// rather not drag). Columns themselves are user data, not a fixed set --
// add/rename/reorder/delete all just post a new ordered `stages` array.
export default function PipelineBoard({ allJobs, query, stages, onStage, onNote, onStagesChange, onRemoveManual }) {
  const jobsByStage = useMemo(() => {
    const map = {};
    for (const s of stages) map[s.id] = [];
    for (const j of allJobs) {
      if (!j.stage || !map[j.stage]) continue;
      if (query && !matchQuery(j, query)) continue;
      map[j.stage].push(j);
    }
    for (const k in map) map[k].sort(SORT_FNS.newest);
    return map;
  }, [allJobs, query, stages]);

  const [activeJob, setActiveJob] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e) {
    setActiveJob(null);
    const job = e.active.data.current?.job;
    const stageId = e.over?.id;
    if (job && stageId && stageId !== job.stage) onStage(job.uid, stageId);
  }

  function renameColumn(id, name) {
    onStagesChange(stages.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function deleteColumn(id) {
    onStagesChange(stages.filter((s) => s.id !== id));
  }
  function moveColumn(id, dir) {
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    onStagesChange(next);
  }
  function addColumn(name) {
    const id = slugifyStageId(name, stages.map((s) => s.id));
    const col = { id, name, kind: null, color: nextStageColor(stages) };
    // "Rejected" is meant to stay the last, terminal column -- a freshly
    // added stage belongs in the active pipeline before it, not after.
    const rejectedIdx = stages.findIndex((s) => s.kind === "rejected");
    const next = [...stages];
    if (rejectedIdx === -1) next.push(col);
    else next.splice(rejectedIdx, 0, col);
    onStagesChange(next);
  }

  return (
    <DndContext
      sensors={sensors} collisionDetection={closestCenter}
      onDragStart={(e) => setActiveJob(e.active.data.current?.job || null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveJob(null)}
    >
      {/* Columns share the board's width rather than sitting at a fixed size:
          `auto-fit` + `1fr` lays down as many ~256px tracks as the window
          (and the sidebar's current state) allows, collapses the leftovers
          and stretches what's left to the right edge, wrapping to a second
          row once the stage list outgrows one. Rows are `1fr` too, so a
          single row of columns is exactly as tall as the board and only the
          cards inside a column ever scroll. */}
      <div className="grid h-full auto-rows-[minmax(256px,1fr)] grid-cols-[repeat(auto-fit,minmax(min(256px,100%),1fr))] gap-3 overflow-x-hidden overflow-y-auto p-3">
        {stages.map((s, i) => (
          <Column
            key={s.id} stage={s} jobs={jobsByStage[s.id] || []} stages={stages}
            dragging={!!activeJob}
            onStage={onStage} onNote={onNote} onRemoveManual={onRemoveManual}
            onRename={(name) => renameColumn(s.id, name)}
            onDelete={() => deleteColumn(s.id)}
            onMoveLeft={i > 0 ? () => moveColumn(s.id, -1) : null}
            onMoveRight={i < stages.length - 1 ? () => moveColumn(s.id, 1) : null}
          />
        ))}
        <AddColumn onAdd={addColumn} />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeJob ? <TrackerCard job={activeJob} stages={stages} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ stage, jobs, stages, dragging, onStage, onNote, onRemoveManual, onRename, onDelete, onMoveLeft, onMoveRight }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  useEffect(() => setName(stage.name), [stage.name]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function commitRename() {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== stage.name) onRename(trimmed);
    else setName(stage.name);
  }

  const color = stage.color || "var(--border-strong)";

  return (
    <section
      className={cx(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-surface-2",
        "transition-[border-color,box-shadow,background-color] duration-150",
        isOver ? "border-accent shadow-[var(--shadow-card-hover)] ring-2 ring-accent/35" : "border-border",
      )}
    >
      {/* The stage's colour is the column's identity: a hairline cap on top,
          a wash behind the title and a matching count pill -- enough to tell
          columns apart at a glance without painting the whole card stack. */}
      <div className="h-[3px] flex-none" style={{ background: isOver ? "var(--accent)" : color }} />
      <header
        className="group/head flex flex-none items-center gap-1.5 border-b border-border px-2.5 py-2"
        style={{ background: `color-mix(in srgb, ${color} 7%, var(--surface))` }}
      >
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
        {editing ? (
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(stage.name); setEditing(false); } }}
            className="min-w-0 flex-1 rounded border border-accent bg-surface px-1 py-0.5 text-[12.5px] font-semibold text-text focus:outline-none"
          />
        ) : (
          <button
            type="button" onClick={() => setEditing(true)} title="Rename Column"
            className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-text hover:text-accent-text"
          >
            {stage.name}
          </button>
        )}
        <span
          className="flex-none rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums"
          style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface))`, color: stage.color ? color : "var(--text-dim)" }}
        >
          {jobs.length}
        </span>
        <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100">
          <HeadBtn title="Move Left" onClick={onMoveLeft} disabled={!onMoveLeft}><IconChevronLeft className="h-3 w-3" /></HeadBtn>
          <HeadBtn title="Move Right" onClick={onMoveRight} disabled={!onMoveRight}><IconChevronRight className="h-3 w-3" /></HeadBtn>
          <HeadBtn title="Delete Column" onClick={() => setConfirmDelete(true)}><IconTrash className="h-3 w-3" /></HeadBtn>
        </div>
      </header>

      {confirmDelete && (
        <div className="flex flex-none items-center gap-1.5 border-b border-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
          <span className="flex-1">Delete &quot;{stage.name}&quot;{jobs.length ? ` — ${jobs.length} card${jobs.length === 1 ? "" : "s"} leave the tracker` : ""}?</span>
          <button type="button" onClick={onDelete} className="rounded border border-danger/40 px-1.5 py-0.5 font-medium hover:bg-danger/10">Delete</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded px-1.5 py-0.5 hover:bg-surface">Cancel</button>
        </div>
      )}

      <div ref={setNodeRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2">
        {jobs.length === 0
          ? (
            <div className={cx(
              "m-auto flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-center transition-colors duration-150",
              isOver ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong/70 text-text-faint",
            )}>
              <IconLayers className="h-5 w-5 opacity-60" />
              <span className="text-[12px] font-medium">{isOver ? "Drop To Move Here" : dragging ? "Drop Here" : "No Cards Yet"}</span>
            </div>
          )
          : jobs.map((j) => <TrackerCard key={j.uid} job={j} stages={stages} onStage={onStage} onNote={onNote} onRemoveManual={onRemoveManual} />)}
      </div>
    </section>
  );
}

function HeadBtn({ title, onClick, disabled, children }) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={disabled}
      className="grid h-5 w-5 place-items-center rounded text-text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// Occupies the track after the last stage, full height, so the row of
// columns reads as complete instead of trailing off into empty board.
function AddColumn({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (trimmed) onAdd(trimmed);
    setName(""); setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="group/add flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong/60 text-text-faint transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-accent-text"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-current opacity-70 transition-opacity group-hover/add:opacity-100">
          <IconPlus className="h-4 w-4" />
        </span>
        <span className="text-[12.5px] font-medium">Add Column</span>
      </button>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-accent bg-surface p-3">
      <div className="flex w-full max-w-[240px] items-center gap-1 rounded-lg border border-accent bg-surface px-1.5 py-1">
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Column Name…"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setName(""); setOpen(false); } }}
          className="min-w-0 flex-1 bg-transparent px-1 text-[12.5px] text-text focus:outline-none"
        />
        <button type="button" onClick={submit} title="Add" className="grid h-6 w-6 flex-none place-items-center rounded text-accent hover:bg-accent-soft"><IconPlus className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => { setName(""); setOpen(false); }} title="Cancel" className="grid h-6 w-6 flex-none place-items-center rounded text-text-dim hover:bg-surface-2"><IconClose className="h-3 w-3" /></button>
      </div>
      <span className="text-[11px] text-text-faint">Enter To Add · Esc To Cancel</span>
    </div>
  );
}

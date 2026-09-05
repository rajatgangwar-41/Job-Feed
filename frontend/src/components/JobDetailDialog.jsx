"use client";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { absTime, ago, expLabel, hasPay, kindOf, when } from "@/lib/format";
import { payText } from "@/lib/salary";
import { cx } from "@/lib/cx";
import SourcePill from "./SourcePill";
import StageSelect from "./StageSelect";
import { IconCash, IconCheck, IconClock, IconClose, IconExp, IconExternal, IconPin, IconTag, IconTrash } from "./icons";

// Everything a tracker card used to try to fit on its face. The card keeps
// the two things you scan a column for -- role and company -- and tapping it
// opens this, so the board stays legible while the detail is still one click
// away.
export default function JobDetailDialog({ job: j, stages, onClose, onStage, onNote }) {
  const ref = useRef(null);
  const [text, setText] = useState(j.notes || "");
  const debouncedNote = useDebouncedCallback((v) => onNote?.(j.uid, v), 500);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    // Esc and the backdrop both end up firing the native `close` event, so
    // listening there keeps the parent's open state in sync however it goes.
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onClose]);

  const fields = [
    j.location && { icon: IconPin, label: "Location", value: j.location },
    hasPay(j) && { icon: IconCash, label: "Pay", value: payText(j.pay) ?? j.pay, tone: "text-success" },
    expLabel(j.exp_min) && { icon: IconExp, label: "Experience", value: expLabel(j.exp_min) },
    { icon: IconTag, label: "Type", value: kindOf(j) === "internship" ? "Internship" : "Full Time" },
    { icon: IconClock, label: j.posted_at ? "Posted" : "First Seen", value: `${absTime(when(j))} · ${ago(when(j))} ago` },
    j.applied_at && { icon: IconCheck, label: "Applied", value: absTime(j.applied_at) },
  ].filter(Boolean);

  const tags = j.tags && j.tags !== "job" && j.tags !== "internship" ? j.tags : null;

  return (
    <dialog
      ref={ref}
      // A click that lands on the dialog element itself (not the panel that
      // fills it) came from the backdrop.
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
      // The board's global shortcuts listen on `document` and skip only real
      // form fields, so without this an "s" typed in here would also mark
      // the focused card saved.
      onKeyDown={(e) => e.stopPropagation()}
      className="w-[min(520px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text shadow-[var(--shadow-pop)] backdrop:bg-black/45"
    >
      <div className="flex items-start gap-2 border-b border-border px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <SourcePill source={j.source} size="md" />
          <h2 className="mt-2 text-[16.5px] font-semibold leading-snug text-text">{j.title}</h2>
          <div className="mt-0.5 text-[13px] font-medium text-text-muted">{j.company || "—"}</div>
        </div>
        <button
          type="button" onClick={() => ref.current.close()} aria-label="Close"
          className="-mr-1 -mt-1 grid h-8 w-8 flex-none place-items-center rounded-md text-text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-text active:scale-95"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-x-5 gap-y-3 px-4 py-3.5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="flex min-w-0 items-start gap-2">
            <f.icon className="mt-[3px] h-3.5 w-3.5 flex-none text-text-faint" strokeWidth={2} />
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[.05em] text-text-faint">{f.label}</div>
              <div className={cx("text-[12.5px] font-medium break-words", f.tone || "text-text")}>{f.value}</div>
            </div>
          </div>
        ))}
        {tags && (
          <div className="flex min-w-0 items-start gap-2 sm:col-span-2">
            <span className="h-3.5 w-3.5 flex-none" aria-hidden />
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[.05em] text-text-faint">Skills / Tags</div>
              <div className="text-[12.5px] text-text-dim break-words">{tags}</div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <label htmlFor={`note-${j.uid}`} className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[.05em] text-text-faint">
          Notes
        </label>
        <textarea
          id={`note-${j.uid}`} rows={3} value={text}
          onChange={(e) => { setText(e.target.value); debouncedNote(e.target.value); }}
          placeholder="Recruiter, referral, follow-up date…"
          className="block w-full resize-y rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[12.5px] leading-relaxed text-text transition-colors duration-150 focus:border-accent focus:bg-surface focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/50 px-4 py-3">
        <StageSelect stages={stages} value={j.stage} onChange={(id) => onStage(j.uid, id)} />
        <button
          type="button"
          onClick={() => { onStage(j.uid, null); ref.current.close(); }}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-[5px] text-[12px] font-medium text-text-dim transition-colors duration-150 hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
        >
          <IconTrash className="h-3.5 w-3.5" /> Remove
        </button>
        <a
          href={j.url} target="_blank" rel="noopener"
          className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-[6px] text-[12.5px] font-semibold text-white no-underline transition-[filter] duration-150 hover:brightness-110"
        >
          Open Listing <IconExternal className="h-3.5 w-3.5" />
        </a>
      </div>
    </dialog>
  );
}

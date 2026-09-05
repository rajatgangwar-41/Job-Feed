"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import StageSelect from "./StageSelect";
import { IconClose, IconPlus } from "./icons";

// The write-side twin of JobDetailDialog: same frame, same field order, but
// every value is an input rather than a read-out. It exists because the board
// is only ever as honest as the applications it knows about, and the ones
// that go through a referral or a company's own careers page never come from
// a scraper.
//
// Only the title is required. A half-remembered entry beats an absent one --
// the point is that the funnel counts it -- so everything else can be filled
// in later by reopening the card.
const TODAY = () => new Date().toISOString().slice(0, 10);

export default function ManualJobDialog({ stages, onSave, onClose }) {
  const ref = useRef(null);
  const [f, setF] = useState({
    title: "", company: "", location: "", pay: "", url: "", via: "",
    exp: "", tags: "", notes: "", stage: "applied", appliedOn: TODAY(),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) { setErr("A role title is the one thing this needs."); return; }
    setBusy(true);
    setErr(null);
    try {
      // A date input gives local midnight; seconds is what every other
      // timestamp on this board is in.
      const applied_at = f.appliedOn
        ? new Date(`${f.appliedOn}T12:00:00`).getTime() / 1000
        : null;
      const exp = f.exp.trim() === "" ? null : Number(f.exp);
      await onSave({
        title,
        company: f.company.trim() || undefined,
        location: f.location.trim() || undefined,
        pay: f.pay.trim() || undefined,
        url: f.url.trim() || undefined,
        via: f.via.trim() || undefined,
        tags: f.tags.trim() || undefined,
        exp_min: Number.isFinite(exp) ? exp : null,
        applied_at,
        stage: f.stage,
        notes: f.notes.trim() || undefined,
      });
      ref.current?.close();
    } catch {
      setErr("Could not save that — check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
      // The board's shortcuts listen on document; without this, typing a
      // company name would also mark the focused card saved.
      onKeyDown={(e) => e.stopPropagation()}
      className="w-[min(560px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text shadow-[var(--shadow-pop)] backdrop:bg-black/45"
    >
      <form onSubmit={submit}>
        <div className="flex items-start gap-2 border-b border-border px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] font-semibold leading-snug text-text">Add An Application</h2>
            <p className="mt-0.5 text-[12px] text-text-dim">
              For a role you applied to somewhere this board does not scrape. Only you can see it.
            </p>
          </div>
          <button
            type="button" onClick={() => ref.current.close()} aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 flex-none place-items-center rounded-md text-text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-text active:scale-95"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-2">
          <Field label="Role" required className="sm:col-span-2">
            <input autoFocus value={f.title} onChange={set("title")} placeholder="Backend Engineer" className={INPUT} />
          </Field>
          <Field label="Company">
            <input value={f.company} onChange={set("company")} placeholder="Acme Pvt Ltd" className={INPUT} />
          </Field>
          <Field label="Applied Via" hint="Where you actually applied">
            <input value={f.via} onChange={set("via")} placeholder="LinkedIn, referral, careers page…" className={INPUT} />
          </Field>
          <Field label="Location">
            <input value={f.location} onChange={set("location")} placeholder="Bengaluru / Remote" className={INPUT} />
          </Field>
          <Field label="Pay">
            <input value={f.pay} onChange={set("pay")} placeholder="₹8 – 12 LPA" className={INPUT} />
          </Field>
          <Field label="Experience" hint="Years, 0 for fresher">
            <input value={f.exp} onChange={set("exp")} type="number" min="0" max="30" step="0.5" placeholder="0" className={INPUT} />
          </Field>
          <Field label="Applied On">
            <input value={f.appliedOn} onChange={set("appliedOn")} type="date" max={TODAY()} className={INPUT} />
          </Field>
          <Field label="Listing URL" className="sm:col-span-2">
            <input value={f.url} onChange={set("url")} type="url" placeholder="https://…" className={INPUT} />
          </Field>
          <Field label="Skills / Tags" className="sm:col-span-2">
            <input value={f.tags} onChange={set("tags")} placeholder="React, Node, PostgreSQL" className={INPUT} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              rows={2} value={f.notes} onChange={set("notes")}
              placeholder="Recruiter, referral, follow-up date…"
              className={cx(INPUT, "resize-y leading-relaxed")}
            />
          </Field>
        </div>

        {err && (
          <p role="alert" className="mx-4 mb-1 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
            {err}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/50 px-4 py-3">
          <StageSelect stages={stages} value={f.stage} onChange={(id) => setF((p) => ({ ...p, stage: id || "applied" }))} />
          <button
            type="submit" disabled={busy}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-[6px] text-[12.5px] font-semibold text-white transition-[filter] duration-150 hover:brightness-110 disabled:opacity-60"
          >
            <IconPlus className="h-3.5 w-3.5" /> {busy ? "Adding…" : "Add To Tracker"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const INPUT =
  "block w-full rounded-lg border border-border bg-surface-2 px-2.5 py-[7px] text-[12.5px] text-text " +
  "transition-colors duration-150 focus:border-accent focus:bg-surface focus:outline-none";

function Field({ label, hint, required, className, children }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[.05em] text-text-faint">
        {label}{required && <span className="text-danger"> *</span>}
        {hint && <span className="ml-1 font-medium normal-case tracking-normal text-text-faint/80">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

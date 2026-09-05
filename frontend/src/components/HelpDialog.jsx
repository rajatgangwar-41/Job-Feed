"use client";
import { useEffect, useRef } from "react";
import { IconClose } from "./icons";

export default function HelpDialog({ open, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Escape (or any other native close, e.g. clicking the backdrop is not
  // wired, but Esc is default <dialog> behaviour) fires the `close` event
  // without going through our onClose click handler -- listen for it
  // directly so `open` state stays in sync either way.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onClose]);

  return (
    <dialog ref={ref} className="w-[min(560px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text shadow-[var(--shadow-pop)] backdrop:bg-black/45">
      <div className="flex items-center border-b border-border px-[18px] py-3.5 font-semibold">
        Keyboard Shortcuts
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-md text-text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-text active:scale-95">
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 px-[18px] py-3.5 text-[13px]">
        <Section title="Navigate" />
        <Row label="Next / Previous Listing" keys={["j", "k"]} />
        <Row label="Open Focused Listing" keys={["Enter", "o"]} />
        <Row label="Search" keys={["/"]} />
        <Row label="Clear Search / Close" keys={["Esc"]} />
        <Row label="Board · Tracker" keys={["1", "2"]} />
        <Row label="Toggle Filter Panel" keys={["f"]} />
        <Section title="Mark The Focused Listing" />
        <Row label="Save / Unsave" keys={["s"]} />
        <Row label="Applied" keys={["a"]} />
        <Row label="Not Interested" keys={["r"]} />
        <Row label="Hide" keys={["x"]} />
        <Section title="Display" />
        <Row label="Density" keys={["d"]} />
        <Row label="Theme" keys={["t"]} />
        <Row label="This Help" keys={["?"]} />
      </div>
    </dialog>
  );
}

function Section({ title }) {
  return <h4 className="col-span-2 mt-2 mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim first:mt-0">{title}</h4>;
}
function Row({ label, keys }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-text-muted">
      <span>{label}</span>
      <span className="flex gap-1">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
    </div>
  );
}

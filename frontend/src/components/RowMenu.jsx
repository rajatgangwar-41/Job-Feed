"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconBan, IconLink, IconExternal, IconEye } from "./icons";

// A small popover anchored to whichever row's "more" button opened it.
// `anchor` is that button's getBoundingClientRect(); position flips above
// the button when there isn't room below.
export default function RowMenu({ anchor, job, onClose, onHideCompany, onCopyLink, onOpenTab, onToggleSeen }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!ref.current || !anchor) return;
    const mw = ref.current.offsetWidth, mh = ref.current.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - mw - 8, anchor.right - mw));
    const top = anchor.bottom + mh + 8 > window.innerHeight ? anchor.top - mh - 4 : anchor.bottom + 4;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    // the trigger button handles its own toggle; skip it here so a second
    // click on "more" doesn't close-then-reopen in the same gesture
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest("[data-menu-trigger]")) onClose();
    };
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  if (!anchor || !job) return null;
  const companyLabel = (job.company || "This Company").slice(0, 28);

  return (
    <div
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="animate-pop-in fixed z-50 min-w-[200px] origin-top-right rounded-[10px] border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
    >
      <MenuItem icon={<IconBan className="h-3.5 w-3.5" />} onClick={() => { onHideCompany(job); onClose(); }}>
        Hide All From {companyLabel}
      </MenuItem>
      <MenuItem icon={<IconLink className="h-3.5 w-3.5" />} onClick={() => { onCopyLink(job); onClose(); }}>Copy Link</MenuItem>
      <MenuItem icon={<IconExternal className="h-3.5 w-3.5" />} onClick={() => { onOpenTab(job); onClose(); }}>Open In A New Tab</MenuItem>
      <MenuItem icon={<IconEye className="h-3.5 w-3.5" />} onClick={() => { onToggleSeen(job); onClose(); }}>
        {job.opened ? "Mark As Not Opened" : "Mark As Opened"}
      </MenuItem>
    </div>
  );
}

function MenuItem({ icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-text transition-colors duration-150 hover:bg-surface-2">
      <span className="text-text-dim">{icon}</span>{children}
    </button>
  );
}

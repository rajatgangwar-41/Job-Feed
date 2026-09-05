"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { IconCheck, IconChevronDown } from "./icons";

// A stage picker to replace the native <select> the tracker cards used to
// carry. The trigger could be styled; the dropped-open <option> list could
// not -- that list is drawn by the OS, so it arrived as a grey box with a
// system-blue highlight in the middle of an otherwise themed board, and
// ignored dark mode entirely.
//
// The menu is portalled to <body> rather than rendered in place: the card
// clips its own overflow and the column around it scrolls, so an in-flow
// menu would be cut off at the card's edge.
export default function StageSelect({ stages, value, onChange }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(0);
  const baseId = useId();

  const current = stages.find((s) => s.id === value) || null;

  const close = useCallback((refocus) => {
    setOpen(false);
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);

  function openMenu() {
    setAnchor(btnRef.current.getBoundingClientRect());
    setActive(Math.max(0, stages.findIndex((s) => s.id === value)));
    setPos(null);
    setOpen(true);
  }

  function pick(id) {
    close(true);
    if (id !== value) onChange(id);
  }

  // Measure, then place: flip above the trigger when the menu would run off
  // the bottom, and keep it inside the viewport horizontally.
  useLayoutEffect(() => {
    if (!open || !anchor || !menuRef.current) return;
    const mw = menuRef.current.offsetWidth, mh = menuRef.current.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(window.innerWidth - mw - 8, anchor.left)),
      top: anchor.bottom + mh + 8 > window.innerHeight
        ? Math.max(8, anchor.top - mh - 4)
        : anchor.bottom + 4,
    });
  }, [open, anchor]);

  useEffect(() => { if (open) menuRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close(false);
    };
    // The menu is fixed-positioned against a card inside a scrolling column,
    // so it would drift away from its trigger -- close instead of chasing.
    // Scrolling the menu's own list is exempt.
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  // While the menu is open it owns the keyboard: the board's global
  // shortcuts (j/k to move focus, s/a/r/x to mark) listen on `document` and
  // skip only real form fields, so without stopping propagation an arrow key
  // here would also walk the card focus behind the menu.
  function onKeyDown(e) {
    e.stopPropagation();
    const last = stages.length - 1;
    switch (e.key) {
      case "Escape": case "Tab": e.preventDefault(); close(true); break;
      case "ArrowDown": e.preventDefault(); setActive((i) => (i >= last ? 0 : i + 1)); break;
      case "ArrowUp": e.preventDefault(); setActive((i) => (i <= 0 ? last : i - 1)); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(last); break;
      case "Enter": case " ": e.preventDefault(); if (stages[active]) pick(stages[active].id); break;
      default: break;
    }
  }

  return (
    <>
      <button
        ref={btnRef} type="button" title="Move To Stage"
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close(true) : openMenu())}
        className={cx(
          "flex max-w-[152px] items-center gap-1.5 rounded-md border py-[3px] pl-2 pr-1 text-[10.5px] font-semibold transition-colors duration-150",
          open
            ? "border-accent bg-accent-soft text-accent-text"
            : "border-border bg-surface text-text-dim hover:border-border-strong hover:text-text",
        )}
      >
        <span
          className="h-1.5 w-1.5 flex-none rounded-full"
          style={{ background: current?.color || "var(--text-faint)" }}
        />
        <span className="min-w-0 flex-1 truncate text-left">{current?.name || "No Stage"}</span>
        <IconChevronDown
          className={cx("h-3 w-3 flex-none opacity-60 transition-transform duration-150", open && "rotate-180")}
          strokeWidth={2.5}
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef} role="menu" tabIndex={-1} onKeyDown={onKeyDown}
          aria-activedescendant={stages[active] ? `${baseId}-${active}` : undefined}
          style={{
            top: pos?.top ?? -9999, left: pos?.left ?? -9999,
            minWidth: anchor ? Math.max(168, anchor.width) : 168,
            visibility: pos ? "visible" : "hidden",
          }}
          className="animate-pop-in fixed z-50 max-h-[min(320px,58vh)] max-w-[260px] overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-surface p-1 shadow-[var(--shadow-pop)] focus:outline-none"
        >
          {stages.map((s, i) => {
            const selected = s.id === value;
            return (
              <button
                key={s.id} id={`${baseId}-${i}`} type="button"
                role="menuitemradio" aria-checked={selected}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s.id)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150",
                  i === active ? "bg-surface-2" : "",
                  selected ? "font-semibold text-text" : "text-text-muted",
                )}
              >
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: s.color || "var(--border-strong)" }}
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {selected && <IconCheck className="h-3.5 w-3.5 flex-none text-accent" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

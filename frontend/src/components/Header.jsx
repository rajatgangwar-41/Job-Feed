"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { cx } from "@/lib/cx";
import { IconFilter, IconSearch, IconClose, IconRefresh, IconDensity, IconHelp, IconChart, THEME_ICON } from "./icons";
import PollRing from "./PollRing";

export default function Header({
  query, onQueryChange, view, onViewChange, trackerCount,
  lastPoll, pollMinutes, failing, polling, onRefresh,
  density, onToggleDensity, theme, onCycleTheme,
  onToggleSidebar, sidebarOpen, onOpenHelp, searchRef, opsHref,
}) {
  const [local, setLocal] = useState(query);
  useEffect(() => { setLocal(query); }, [query]);
  // Filtering the job list is now cheap (single-pass, memoized -- see
  // useFacetCounts in Sidebar.jsx), so the board can react on every
  // keystroke instead of waiting out a debounce: what's on screen always
  // matches exactly what's typed, not a slightly-stale snapshot of it.
  function handleInput(e) {
    const v = e.target.value;
    setLocal(v);
    onQueryChange(v.trim());
  }
  function clear() {
    setLocal("");
    onQueryChange("");
    searchRef.current?.focus();
  }
  const ThemeIcon = THEME_ICON[theme] || THEME_ICON.auto;

  return (
    <header className="flex min-h-[50px] flex-wrap items-center gap-2.5 border-b border-border bg-surface px-3.5 py-2">
      <button type="button" onClick={onToggleSidebar} title="Toggle Filters (F)" aria-label="Toggle Filters"
        className={cx("grid h-8 w-8 flex-none place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface-2 active:scale-95", sidebarOpen && "bg-accent-soft text-accent-text")}>
        <IconFilter className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-accent to-violet text-[12px] font-extrabold text-white">JW</span>
        Job Watch
      </div>
      <PollRing lastPoll={lastPoll} pollMinutes={pollMinutes} polling={polling} failing={failing} />
      <div className="relative order-5 mx-auto flex w-full max-w-[520px] flex-1 basis-full items-center sm:order-none sm:basis-auto">
        <IconSearch className="pointer-events-none absolute left-2.5 h-[15px] w-[15px] text-text-dim" />
        <input
          ref={searchRef} type="search" value={local} onChange={handleInput}
          placeholder="Search Title, Company, Location, Skills… (Use -word To Exclude)"
          autoComplete="off" spellCheck={false}
          className="w-full rounded-md border border-border bg-surface-2 py-1.5 pr-14 pl-8 transition-colors duration-150 focus:border-accent focus:bg-surface focus:outline-none"
        />
        {local ? (
          <button type="button" onClick={clear} title="Clear Search" aria-label="Clear Search"
            className="animate-pop-in absolute right-2 grid h-5 w-5 place-items-center rounded text-text-dim transition-colors duration-150 hover:bg-border hover:text-text">
            <IconClose className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="absolute right-2">/</kbd>
        )}
      </div>
      <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
        <SegButton active={view === "board"} onClick={() => onViewChange("board")} title="One Column Per Source (1)">Board</SegButton>
        <SegButton active={view === "tracker"} onClick={() => onViewChange("tracker")} title="Saved, Applied And Passed (2)">
          Tracker{trackerCount ? <span className="ml-1 text-[11px] text-text-faint">{trackerCount}</span> : null}
        </SegButton>
      </div>
      <div className="flex items-center gap-1.5">
        {/* Not disabled while polling: the backend already no-ops a poll
            request that overlaps a running one, so blocking the click here
            would only make the button feel stuck for the 45-100s a real
            poll can take. The spinning icon is the "in progress" signal. */}
        <button type="button" onClick={onRefresh} title={polling ? "Polling…" : "Poll All Sources Now"}
          className={cx(
            // min-w + centred so swapping the label for "Polling…" cannot
            // change the button's width and nudge the toolbar around.
            "flex min-w-[104px] items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 active:scale-[0.97]",
            // A scrape runs for minutes with no progress to report, so the
            // button carries a sweeping band rather than a percentage.
            polling && "animate-wave border-accent text-accent-text",
          )}>
          <IconRefresh className={cx("h-3.5 w-3.5 transition-transform", polling && "animate-spin")} />
          {polling ? "Polling…" : "Refresh"}
        </button>
        <IconButton title="Toggle Density (D)" active={density === "compact"} onClick={onToggleDensity}><IconDensity className="h-4 w-4" /></IconButton>
        {/* Rendered only when the server decided this account is on the
            allowlist, and the destination arrives as a value -- there is no
            path literal in this file, so nothing about the route is compiled
            into the client bundle for anyone else to read. Labelled for what
            it shows rather than what it is. */}
        {opsHref && (
          <Link href={opsHref} title="Insights" aria-label="Insights"
            className="grid h-8 w-8 flex-none place-items-center rounded-md text-text-muted no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-text active:scale-95">
            <IconChart className="h-4 w-4" />
          </Link>
        )}
        <IconButton title={`Theme: ${theme} (T)`} onClick={onCycleTheme}><ThemeIcon className="h-4 w-4" /></IconButton>
        <IconButton title="Keyboard Shortcuts (?)" onClick={onOpenHelp}><IconHelp className="h-4 w-4" /></IconButton>
        {/* Clerk's own menu -- account, sign out. Sized to sit level with the
            icon buttons beside it rather than at its default 28px. */}
        <div className="ml-0.5 flex items-center border-l border-border pl-2">
          <UserButton
            appearance={{ elements: { userButtonAvatarBox: { width: 26, height: 26 } } }}
            userProfileMode="modal"
          />
        </div>
      </div>
    </header>
  );
}

function SegButton({ active, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cx("rounded px-2.5 py-1 text-[13px] font-medium text-text-dim transition-colors duration-150", active ? "bg-surface text-text shadow-[var(--shadow-card)]" : "hover:text-text")}>
      {children}
    </button>
  );
}

function IconButton({ title, active, onClick, children }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={cx("grid h-8 w-8 place-items-center rounded-md border border-border text-text-muted transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 active:scale-95",
        active && "border-accent bg-accent-soft text-accent-text")}>
      {children}
    </button>
  );
}

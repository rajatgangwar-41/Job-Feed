"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import BoardView from "./BoardView";
import TrackerView from "./TrackerView";
import Toasts from "./Toasts";
import HelpDialog from "./HelpDialog";
import ManualJobDialog from "./ManualJobDialog";
import RowMenu from "./RowMenu";
import FilterChips from "./FilterChips";
import { BoardSkeleton } from "./Skeleton";
import { usePrefs, useBootstrap } from "@/hooks/usePrefs";
import { useFeed } from "@/hooks/useFeed";
import { useToasts } from "@/hooks/useToasts";
import { useBoardActions } from "@/hooks/useBoardActions";
import { postPoll } from "@/lib/api";
import { passes, hasActiveFilters } from "@/lib/filters";
import { normCo, srcName, absTime, duration } from "@/lib/format";
import { deriveFlagsForStage } from "@/lib/pipeline";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { cx } from "@/lib/cx";

// [label when turned on, label when turned off] -- toast copy per marked field
const LABEL = {
  saved: ["Saved", "Unsaved"], applied: ["Marked Applied", "Applied Undone"],
  flagged: ["Marked Not Interested", "Cleared"], closed: ["Hidden", "Restored"], opened: ["", ""],
};
const EMPTY_STATUS = { applied_24h: 0, applied_7d: 0, applied_all: 0 };

export default function Dashboard({ opsHref = null }) {
  const { prefs, hydrated, update, updateFilters } = usePrefs();
  // Creates the user row, seeds the columns, and returns the visit
  // boundary the "new" badges compare against.
  const visitStart = useBootstrap();
  const { data, args: feedArgs } = useFeed(prefs.filters.age, prefs.filters.exp);
  const { mark, setNote, setStage, setStages, addManual, removeManual } = useBoardActions(feedArgs);
  const { toasts, toast, dismiss } = useToasts();

  const [focusedUid, setFocusedUid] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor, job }
  const [helpOpen, setHelpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const searchRef = useRef(null);

  // Re-rendered every 30s so the relative timestamps children render with
  // `ago()` -- card ages, the per-source "last run" line -- do not sit frozen
  // between polls. Only the re-render matters here, not the value, which is
  // why nothing reads it: the countdown that used to need a clock in this
  // component now keeps its own, at one second, inside PollRing.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const allJobs = useMemo(() => data?.jobs || [], [data]);
  const serverFilters = data?.filters || {};
  const serverDefaults = useMemo(() => ({
    exp: String(serverFilters.max_experience_years ?? "any"),
    age: String(serverFilters.max_age_days ?? "any"),
  }), [serverFilters.max_experience_years, serverFilters.max_age_days]);

  // seed the sidebar's exp/age radios from the server's configured defaults
  // the first time we learn them; afterwards the visitor's own choice sticks
  useEffect(() => {
    // `authed` matters, not just `data`: the feed answers an unauthenticated
    // caller with an empty payload, and seeding from that would fix a brand
    // new account on "any experience / any age" instead of the scraper's
    // fresher-only defaults, before Clerk had even finished resolving.
    if (!data?.authed) return;
    if (prefs.filters.exp == null) updateFilters({ exp: serverDefaults.exp });
    if (prefs.filters.age == null) updateFilters({ age: serverDefaults.age });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const isNewFn = useCallback((j) => j.first_seen > visitStart, [visitStart]);
  const hiddenSet = useMemo(() => new Set(prefs.hiddenCompanies), [prefs.hiddenCompanies]);

  const visibleJobs = useMemo(
    () => allJobs.filter((j) => passes(j, prefs.filters, hiddenSet, isNewFn)),
    [allJobs, prefs.filters, hiddenSet, isNewFn],
  );
  const filtersActive = useMemo(() => hasActiveFilters(prefs.filters, serverDefaults), [prefs.filters, serverDefaults]);
  const runsBySource = useMemo(() => Object.fromEntries((data?.status?.runs || []).map((r) => [r.source, r])), [data]);
  const allSources = useMemo(() => new Set([...Object.keys(runsBySource), ...allJobs.map((j) => j.source)]), [runsBySource, allJobs]);
  const openCount = useMemo(() => allJobs.filter((j) => !j.closed && !j.applied).length, [allJobs]);
  const nNew = useMemo(() => visibleJobs.filter(isNewFn).length, [visibleJobs, isNewFn]);

  // theme: gated on `hydrated` so this never fights the anti-flicker inline
  // script in layout.js with the DEFAULT_PREFS guess before localStorage
  // has actually been read
  useEffect(() => {
    if (!hydrated) return;
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (prefs.theme === "auto") {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [prefs.theme, hydrated]);

  // ---------- marking / notes ----------
  // The optimistic patch and its rollback live in useBoardActions now, so
  // this only has to decide what the toast says and how to undo it.
  const setFlag = useCallback((uid, field, value, opts = {}) => {
    const rawTitle = allJobs.find((j) => j.uid === uid)?.title || "";
    mark({ uid, field, value: value ? 1 : 0 })
      .then(() => {
        if (opts.quiet || !LABEL[field][0]) return;
        const label = rawTitle.length > 40 ? rawTitle.slice(0, 39) + "…" : rawTitle;
        toast(`${LABEL[field][value ? 0 : 1]} · ${label}`,
          () => mark({ uid, field, value: value ? 0 : 1 }));
      })
      .catch(() => toast("Could Not Save — Check Your Connection"));
  }, [allJobs, mark, toast]);

  const onNote = useCallback((uid, text) => {
    setNote({ uid, text }).catch(() => toast("Could Not Save The Note"));
  }, [setNote, toast]);

  // ---------- tracker pipeline (Kanban stages) ----------
  const onStage = useCallback((uid, stage) => {
    setStage({ uid, stage }).catch(() => toast("Could Not Save — Check Your Connection"));
  }, [setStage, toast]);

  // Rethrows so the dialog can keep itself open and show the error, rather
  // than closing over a save that never happened.
  const onAddManual = useCallback(async (fields) => {
    try {
      await addManual(fields);
      toast(`Added · ${fields.title}`);
    } catch (e) {
      toast("Could Not Add That Application");
      throw e;
    }
  }, [addManual, toast]);

  const onRemoveManual = useCallback((uid) => {
    removeManual({ uid })
      .then(() => toast("Application Deleted"))
      .catch(() => toast("Could Not Delete That Application"));
  }, [removeManual, toast]);

  const onStagesChange = useCallback((newStages) => {
    // The mutation validates an exact column shape, so anything the board
    // hung on a stage object locally is dropped here rather than rejected.
    const stages = newStages.map(({ id, name, kind, color }) => ({
      id, name, kind: kind ?? null, color: color ?? null,
    }));
    setStages({ stages }).catch(() => toast("Could Not Save The Columns"));
  }, [setStages, toast]);

  // The backend answers 202 the instant it spawns the scrape thread and never
  // reports back that it finished -- and it only writes `running` to Convex
  // once the scrape is already over, so `data.running` is false throughout.
  // Clicking Refresh therefore changed nothing on screen. This is the missing
  // half: remember when the click happened locally, and treat the next push
  // landing in Convex (which is what moves `last_poll`) as the finish line.
  const [pollStartedAt, setPollStartedAt] = useState(null);
  const poll = useCallback(async () => {
    const ok = await postPoll();
    if (!ok) {
      toast("Could Not Reach The Poller — Is The Local Backend Running?");
      return;
    }
    const started = Date.now();
    setPollStartedAt(started);
    toast("Polling All Sources — This Takes A Few Minutes");
    // A scraper killed mid-run would otherwise leave the button animating for
    // ever. Guarded on identity so a later click's state is not cleared.
    setTimeout(() => setPollStartedAt((t) => (t === started ? null : t)), 10 * 60 * 1000);
  }, [toast]);
  const polling = !!data?.running
    || (pollStartedAt != null && (data?.last_poll || 0) * 1000 < pollStartedAt);

  // ---------- opening a listing ----------
  // A page cannot tile browser windows, so "split view" is a popup opened at
  // the geometry of the right half of the screen, one window per listing
  // (uid-keyed so a second listing never navigates away the first).
  const openJob = useCallback((uid, url) => {
    let win = null;
    if (prefs.split && typeof window !== "undefined") {
      const w = Math.max(560, Math.floor(screen.availWidth / 2));
      const h = screen.availHeight;
      const left = (screen.availLeft || 0) + (screen.availWidth - w);
      win = window.open(url, "jobfeed_" + uid.replace(/[^A-Za-z0-9]/g, "_"),
        `popup=yes,width=${w},height=${h},left=${left},top=${screen.availTop || 0}`);
    }
    if (win) win.focus(); else window.open(url, "_blank", "noopener");
    const job = allJobs.find((j) => j.uid === uid);
    if (job && !job.opened) setFlag(uid, "opened", true, { quiet: true });
  }, [prefs.split, allJobs, setFlag]);

  // ---------- row menu ----------
  const openMenu = useCallback((e, job) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m && m.job.uid === job.uid ? null : { anchor: rect, job }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const hideCompanyAction = useCallback((job) => {
    const key = normCo(job.company);
    if (!key || prefs.hiddenCompanies.includes(key)) return;
    update((p) => ({ hiddenCompanies: [...p.hiddenCompanies, key] }));
    toast(`Hiding Everything From ${job.company}`, () => update((p) => ({ hiddenCompanies: p.hiddenCompanies.filter((c) => c !== key) })));
  }, [prefs.hiddenCompanies, update, toast]);
  const copyLinkAction = useCallback((job) => {
    navigator.clipboard?.writeText(job.url).then(() => toast("Link Copied"));
  }, [toast]);
  const openTabAction = useCallback((job) => {
    window.open(job.url, "_blank", "noopener");
    if (!job.opened) setFlag(job.uid, "opened", true, { quiet: true });
  }, [setFlag]);
  const toggleSeenAction = useCallback((job) => {
    setFlag(job.uid, "opened", !job.opened, { quiet: true });
  }, [setFlag]);

  // ---------- filters ----------
  const resetFilters = useCallback(() => {
    updateFilters(() => ({ ...DEFAULT_FILTERS, exp: serverDefaults.exp, age: serverDefaults.age }));
  }, [updateFilters, serverDefaults]);
  const savePreset = useCallback((name) => {
    update((p) => ({ presets: { ...p.presets, [name]: { ...p.filters } } }));
    toast(`Preset "${name}" Saved`);
  }, [update, toast]);
  const applyPreset = useCallback((name) => {
    const preset = prefs.presets[name];
    if (!preset) return;
    updateFilters(() => ({ ...DEFAULT_FILTERS, ...preset }));
  }, [prefs.presets, updateFilters]);
  const deletePreset = useCallback((name) => {
    update((p) => {
      const presets = { ...p.presets };
      delete presets[name];
      return { presets };
    });
  }, [update]);

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 960) setMobileSidebarOpen((o) => !o);
    else update((p) => ({ sideHidden: !p.sideHidden }));
  }, [update]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    function moveFocus(delta) {
      const container = document.getElementById(`view-${prefs.view}`);
      const uids = container ? [...container.querySelectorAll("[data-uid]")].map((el) => el.dataset.uid) : [];
      if (!uids.length) return;
      let i = uids.indexOf(focusedUid);
      i = i < 0 ? (delta > 0 ? 0 : uids.length - 1) : Math.max(0, Math.min(uids.length - 1, i + delta));
      const uid = uids[i];
      setFocusedUid(uid);
      document.querySelector(`[data-uid="${CSS.escape(uid)}"]`)?.scrollIntoView({ block: "nearest" });
    }
    function onKeyDown(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape") {
        if (helpOpen) return setHelpOpen(false);
        if (menu) return setMenu(null);
        if (mobileSidebarOpen) return setMobileSidebarOpen(false);
        if (typing) {
          if (tag === "input" && e.target === searchRef.current && e.target.value) {
            e.target.value = ""; updateFilters({ q: "" });
          }
          e.target.blur();
          return;
        }
        return setFocusedUid(null);
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const focusedJob = allJobs.find((j) => j.uid === focusedUid);
      switch (e.key) {
        case "/": e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); break;
        case "j": case "ArrowDown": e.preventDefault(); moveFocus(1); break;
        case "k": case "ArrowUp": e.preventDefault(); moveFocus(-1); break;
        case "Enter": case "o": if (focusedJob) openJob(focusedJob.uid, focusedJob.url); break;
        case "s": if (focusedJob) setFlag(focusedJob.uid, "saved", !focusedJob.saved); break;
        case "a": if (focusedJob) setFlag(focusedJob.uid, "applied", !focusedJob.applied); break;
        case "r": if (focusedJob) setFlag(focusedJob.uid, "flagged", !focusedJob.flagged); break;
        case "x": if (focusedJob) setFlag(focusedJob.uid, "closed", !focusedJob.closed); break;
        case "1": update({ view: "board" }); break;
        case "2": update({ view: "tracker" }); break;
        case "f": toggleSidebar(); break;
        case "d": update((p) => ({ density: p.density === "compact" ? "cozy" : "compact" })); break;
        case "t": update((p) => ({ theme: { auto: "dark", dark: "light", light: "auto" }[p.theme] })); break;
        case "?": setHelpOpen(true); break;
        default: break;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [allJobs, focusedUid, prefs.view, helpOpen, menu, mobileSidebarOpen, openJob, setFlag, update, updateFilters, toggleSidebar]);

  // ---------- poll status ----------
  // Handed to the header as values, not as a sentence. The sentence grew by
  // one source name per failure and wrapped the toolbar onto a second row;
  // PollRing draws the same information in a box that never changes size.
  const runs = data?.status?.runs || [];
  const failing = runs.filter((r) => r.error).map((r) => srcName(r.source));
  // Newest run of each outcome. `runs` holds the latest attempt per source,
  // so the max over each group is when a source last managed to return rows
  // and when one last blew up -- which are different moments, and both worth
  // seeing: a fetch that succeeded ten minutes ago next to a failure from
  // two hours ago reads very differently from the reverse.
  const maxTs = (rows) => (rows.length ? Math.max(...rows.map((r) => r.ts)) : null);
  const lastOk = maxTs(runs.filter((r) => !r.error));
  const lastFail = maxTs(runs.filter((r) => r.error));

  const compact = prefs.density === "compact";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header
        query={prefs.filters.q} onQueryChange={(q) => updateFilters({ q })}
        view={prefs.view} onViewChange={(v) => update({ view: v })}
        trackerCount={data?.status?.saved || null}
        lastPoll={data?.last_poll || null} pollMinutes={data?.poll_minutes || 15}
        failing={failing} polling={polling} onRefresh={poll}
        density={prefs.density} onToggleDensity={() => update((p) => ({ density: p.density === "compact" ? "cozy" : "compact" }))}
        theme={prefs.theme} onCycleTheme={() => update((p) => ({ theme: { auto: "dark", dark: "light", light: "auto" }[p.theme] }))}
        onToggleSidebar={toggleSidebar} sidebarOpen={!prefs.sideHidden} onOpenHelp={() => setHelpOpen(true)} searchRef={searchRef}
        opsHref={opsHref}
      />

      <div className={cx(
        "grid min-h-0 flex-1 grid-cols-1 transition-[grid-template-columns] duration-200 ease-in-out",
        !prefs.sideHidden && "min-[960px]:grid-cols-[268px_minmax(0,1fr)]",
        prefs.sideHidden && "min-[960px]:grid-cols-[0_minmax(0,1fr)]",
      )}>
        {mobileSidebarOpen && (
          <div onClick={() => setMobileSidebarOpen(false)} className="animate-scrim-in fixed inset-0 z-[39] bg-black/40 min-[960px]:hidden" />
        )}
        <div className={cx(
          "z-40 border-r border-border bg-surface",
          "fixed inset-y-0 left-0 w-[min(300px,86vw)] shadow-[var(--shadow-pop)] transition-transform duration-200",
          // on desktop the sidebar collapses by its grid track shrinking to 0
          // (animated above), not by disappearing outright, so it slides
          // away instead of popping out of existence
          "min-[960px]:static min-[960px]:w-auto min-[960px]:shadow-none min-[960px]:overflow-hidden min-[960px]:transition-none",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full min-[960px]:translate-x-0",
        )}>
          <Sidebar
            prefs={prefs} updateFilters={updateFilters} update={update}
            jobs={allJobs} allSources={allSources} runsBySource={runsBySource}
            isNewFn={isNewFn}
            onResetFilters={resetFilters} onSavePreset={savePreset} onApplyPreset={applyPreset} onDeletePreset={deletePreset}
          />
        </div>

        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="flex min-h-[44px] flex-wrap items-center gap-2 border-b border-border px-3.5 py-2">
            <span className="whitespace-nowrap text-[12.5px] text-text-dim">
              <b className="font-semibold text-text">{visibleJobs.length}</b> Listing{visibleJobs.length === 1 ? "" : "s"}
              {nNew > 0 && <> · <span className="font-semibold text-accent-text">{nNew} New</span></>}
              {openCount !== visibleJobs.length && !prefs.filters.done && <span> Of {openCount}</span>}
            </span>
            {(lastOk || lastFail) && (
              <span className="whitespace-nowrap text-[12px] text-text-faint">
                {lastOk && (
                  <>Last Fetch <span className="text-text-dim">{absTime(lastOk)}</span>
                    {data?.poll_seconds ? <span className="text-text-dim"> · Took {duration(data.poll_seconds)}</span> : null}</>
                )}
                {lastOk && lastFail && " · "}
                {lastFail && <>Last Failure <span className="text-danger">{absTime(lastFail)}</span></>}
              </span>
            )}
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              <FilterChips filters={prefs.filters} serverDefaults={serverDefaults} updateFilters={updateFilters} onClearAll={resetFilters} />
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            {!data ? (
              <div className="absolute inset-0 animate-fade-in"><BoardSkeleton /></div>
            ) : (
              <>
                <div id="view-board" className={cx("absolute inset-0 animate-fade-in", prefs.view !== "board" && "hidden")}>
                  <BoardView
                    jobs={visibleJobs} allSources={allSources} runsBySource={runsBySource}
                    sourceFilter={prefs.filters.sources} cols={prefs.cols} compact={compact}
                    isNewFn={isNewFn} focusedUid={focusedUid} filtersActive={filtersActive}
                    onOpen={openJob} onMark={setFlag} onMenu={openMenu} onFocus={setFocusedUid} onResetFilters={resetFilters}
                  />
                </div>
                <div id="view-tracker" className={cx("absolute inset-0 animate-fade-in", prefs.view !== "tracker" && "hidden")}>
                  <TrackerView
                    allJobs={allJobs} query={prefs.filters.q} status={data?.status || EMPTY_STATUS}
                    stages={data?.stages || []} funnel={data?.funnel || {}} history={data?.history || {}}
                    tab={prefs.trackerTab} onTabChange={(trackerTab) => update({ trackerTab })}
                    onNote={onNote} onStage={onStage} onStagesChange={onStagesChange}
                    onAddManual={() => setManualOpen(true)} onRemoveManual={onRemoveManual}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      <Toasts toasts={toasts} dismiss={dismiss} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {manualOpen && (
        <ManualJobDialog
          stages={data?.stages || []}
          onClose={() => setManualOpen(false)}
          onSave={onAddManual}
        />
      )}
      <RowMenu
        anchor={menu?.anchor} job={menu?.job} onClose={closeMenu}
        onHideCompany={hideCompanyAction} onCopyLink={copyLinkAction} onOpenTab={openTabAction} onToggleSeen={toggleSeenAction}
      />
    </div>
  );
}

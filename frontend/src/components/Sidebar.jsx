"use client";
import { useEffect, useMemo, useState } from "react";
import { ORDER, KINDS, EXP_OPTS, AGE_OPTS } from "@/lib/constants";
import { srcColor, srcName, kindOf, hasPay, isRemote, isOutsideIndia, normCo, matchQuery } from "@/lib/format";
import { SALARY_BUCKETS, inSalaryBuckets } from "@/lib/salary";
import { CITY_OPTIONS, matchesCity } from "@/lib/cities";
import { cx } from "@/lib/cx";
import { IconClose } from "./icons";

// Every checkbox/radio option needs "how many rows would this leave, with
// every *other* filter still applied" -- computing that the naive way (call
// the shared `passes()` predicate once per option, each doing its own full
// scan of every job) is ~30 full passes over the job list on every
// keystroke or click, most of it re-deriving the same few things
// (kindOf/isRemote/salary bucket/city match) over and over. This does it in
// one pass: each job's independent "does this filter's *own* rule hold"
// booleans are computed once, then combined per facet.
function useFacetCounts(jobs, f, hiddenSet, isNewFn) {
  return useMemo(() => {
    const sources = {}, kinds = {}, salary = {}, cities = {};
    let remote = 0, outsideIndia = 0, payUndisclosed = 0, newOnly = 0, savedOnly = 0, hideOpened = 0, done = 0;
    const locLower = f.loc.toLowerCase();

    for (const j of jobs) {
      // never faceted -- these three apply identically no matter which
      // option is being counted, so they gate entry into the loop body
      if (hiddenSet.has(normCo(j.company))) continue;
      if (f.loc && !(j.location || "").toLowerCase().includes(locLower)) continue;
      if (f.q && !matchQuery(j, f.q)) continue;

      const sourcesOk = !f.sources.length || f.sources.includes(j.source);
      const kindsOk = !f.kinds.length || f.kinds.includes(kindOf(j));
      const salaryOk = !f.salary.length || inSalaryBuckets(j, f.salary);
      const citiesOk = !f.cities.length || matchesCity(j, f.cities);

      // One entry per simple (non-multi-select) filter. `ok` is always "does
      // this job satisfy filter i as currently configured" (used to gate
      // every *other* facet's count); `raw` is the row's own displayed
      // count predicate, independent of whether the filter is even active.
      // Keeping these separate matters: for most filters checking the box
      // keeps jobs *with* the trait (ok and raw agree), but "Undisclosed"
      // and "Hide already opened" check the box to keep jobs *without* one
      // -- collapsing raw/ok into one formula silently inverted those two
      // in an earlier version of this function.
      const dims = [
        { key: "done", ok: f.done || !(j.closed || j.applied), raw: j.closed || j.applied },
        { key: "remote", ok: !f.remote || isRemote(j), raw: isRemote(j) },
        { key: "outsideIndia", ok: !f.outsideIndia || isOutsideIndia(j), raw: isOutsideIndia(j) },
        { key: "payUndisclosed", ok: !f.payUndisclosed || !hasPay(j), raw: !hasPay(j) },
        { key: "newOnly", ok: !f.newOnly || isNewFn(j), raw: isNewFn(j) },
        { key: "savedOnly", ok: !f.savedOnly || !!j.saved, raw: !!j.saved },
        { key: "hideOpened", ok: !f.hideOpened || !(j.opened && !j.saved), raw: j.opened && !j.saved },
      ];
      const multiOk = sourcesOk && kindsOk && salaryOk && citiesOk;

      if (multiOk) {
        dims.forEach((d, i) => {
          const restOk = dims.every((d2, k) => k === i || d2.ok);
          if (restOk && d.raw) {
            if (d.key === "done") done++;
            else if (d.key === "remote") remote++;
            else if (d.key === "outsideIndia") outsideIndia++;
            else if (d.key === "payUndisclosed") payUndisclosed++;
            else if (d.key === "newOnly") newOnly++;
            else if (d.key === "savedOnly") savedOnly++;
            else hideOpened++;
          }
        });
      }

      const allSimpleOk = dims.every((d) => d.ok);
      if (allSimpleOk && kindsOk && salaryOk && citiesOk) sources[j.source] = (sources[j.source] || 0) + 1;
      if (allSimpleOk && sourcesOk && salaryOk && citiesOk) { const k = kindOf(j); kinds[k] = (kinds[k] || 0) + 1; }
      if (allSimpleOk && sourcesOk && kindsOk && citiesOk) {
        for (const [key] of SALARY_BUCKETS) if (inSalaryBuckets(j, [key])) salary[key] = (salary[key] || 0) + 1;
      }
      if (allSimpleOk && sourcesOk && kindsOk && salaryOk) {
        for (const [key] of CITY_OPTIONS) if (matchesCity(j, [key])) cities[key] = (cities[key] || 0) + 1;
      }
    }
    return { sources, kinds, salary, cities, remote, outsideIndia, payUndisclosed, newOnly, savedOnly, hideOpened, done };
  }, [jobs, f, hiddenSet, isNewFn]);
}

export default function Sidebar({
  prefs, updateFilters, update, jobs, allSources, runsBySource, isNewFn,
  onResetFilters, onSavePreset, onApplyPreset, onDeletePreset,
}) {
  const f = prefs.filters;
  const hiddenSet = useMemo(() => new Set(prefs.hiddenCompanies), [prefs.hiddenCompanies]);
  const facets = useFacetCounts(jobs, f, hiddenSet, isNewFn);

  let srcs = [...ORDER.filter((s) => allSources.has(s)), ...[...allSources].filter((s) => !ORDER.includes(s)).sort()];

  const isSourceChecked = (s) => !f.sources.length || f.sources.includes(s);
  function toggleSource(s) {
    const checkedNow = srcs.filter(isSourceChecked);
    const next = isSourceChecked(s) ? checkedNow.filter((x) => x !== s) : [...checkedNow, s];
    updateFilters({ sources: next.length === srcs.length ? [] : next });
  }
  const isKindChecked = (k) => !f.kinds.length || f.kinds.includes(k);
  function toggleKind(k) {
    const checkedNow = KINDS.map(([kk]) => kk).filter(isKindChecked);
    const next = isKindChecked(k) ? checkedNow.filter((x) => x !== k) : [...checkedNow, k];
    updateFilters({ kinds: next.length === KINDS.length ? [] : next });
  }

  // unlike sources/kinds, an empty array here genuinely means "no salary
  // filter" (rows with unparseable pay, like Indeed's, still show) -- so
  // this never auto-collapses "every bucket ticked" back to [], since that
  // would silently start showing unparseable-pay rows again
  const isSalaryChecked = (key) => f.salary.includes(key);
  function toggleSalary(key) {
    updateFilters({ salary: isSalaryChecked(key) ? f.salary.filter((k) => k !== key) : [...f.salary, key] });
  }

  // same "empty means no filter, not everything" reasoning as salary
  const isCityChecked = (key) => f.cities.includes(key);
  function toggleCity(key) {
    updateFilters({ cities: isCityChecked(key) ? f.cities.filter((k) => k !== key) : [...f.cities, key] });
  }

  const [locInput, setLocInput] = useState(f.loc);
  useEffect(() => { setLocInput(f.loc); }, [f.loc]);
  // No debounce, same reasoning as the header search box: filtering is
  // cheap now, so this stays exactly in sync with what's typed instead of
  // trailing it by a fixed delay.
  function handleLocInput(e) {
    const v = e.target.value;
    setLocInput(v);
    updateFilters({ loc: v.trim() });
  }

  const [presetName, setPresetName] = useState("");

  // f.exp/f.age are null for one render before the server's defaults are
  // known (seeded by an effect in Dashboard, which by definition runs after
  // this paints) -- skip the synthetic "custom value" option in that case,
  // rather than handing a radio a `value={null}` prop.
  const expOpts = f.exp == null || EXP_OPTS.some(([v]) => v === f.exp) ? EXP_OPTS : [...EXP_OPTS, [f.exp, f.exp === "any" ? "Any" : f.exp + "y"]];
  const ageOpts = f.age == null || AGE_OPTS.some(([v]) => v === f.age) ? AGE_OPTS : [...AGE_OPTS, [f.age, f.age === "any" ? "Any" : f.age + "d"]];

  return (
    <aside className="no-scrollbar h-full overflow-x-hidden overflow-y-auto bg-surface pt-2 pb-4 text-[12.5px]">
      <Section title="Platforms" actions={
        !!f.sources.length && (
          <span className="overflow-hidden rounded-full border border-border">
            <ToggleLink active onClick={() => updateFilters({ sources: [] })}>All</ToggleLink>
          </span>
        )
      }>
        {srcs.map((s) => {
          const n = facets.sources[s] || 0;
          const run = runsBySource[s];
          return (
            <Checkbox key={s} checked={isSourceChecked(s)} onChange={() => toggleSource(s)} zero={n === 0}
              dot={srcColor(s)} label={srcName(s)} count={n} warn={run && run.error ? run.error : null} />
          );
        })}
      </Section>

      <Section title="Type">
        {KINDS.map(([k, label]) => {
          const n = facets.kinds[k] || 0;
          return <Checkbox key={k} checked={isKindChecked(k)} onChange={() => toggleKind(k)} zero={n === 0} label={label} count={n} />;
        })}
      </Section>

      <Section title="Experience">
        {expOpts.map(([v, label]) => (
          <Radio key={v} name="exp" value={v} checked={f.exp === v} onChange={() => updateFilters({ exp: v })}
            label={label} />
        ))}
      </Section>

      <Section title="Posted Within">
        {ageOpts.map(([v, label]) => (
          <Radio key={v} name="age" value={v} checked={f.age === v} onChange={() => updateFilters({ age: v })}
            label={label} />
        ))}
      </Section>

      <Section title="Location">
        <div className="flex items-center gap-1.5 px-3.5 pb-1">
          <input type="text" value={locInput} onChange={handleLocInput} placeholder="City Or Region…"
            className="w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] focus:border-accent focus:outline-none" />
        </div>
        {CITY_OPTIONS.map(([key, label]) => {
          const n = facets.cities[key] || 0;
          return <Checkbox key={key} checked={isCityChecked(key)} onChange={() => toggleCity(key)} zero={n === 0} label={label} count={n} />;
        })}
        <Checkbox checked={f.remote} onChange={(e) => updateFilters({ remote: e.target.checked })} label="Work From Home" count={facets.remote} />
        <Checkbox checked={f.outsideIndia} onChange={(e) => updateFilters({ outsideIndia: e.target.checked })} label="Outside India" count={facets.outsideIndia} />
      </Section>

      <Section title="Pay">
        <Checkbox checked={f.payUndisclosed} onChange={(e) => updateFilters({ payUndisclosed: e.target.checked })} label="Undisclosed" count={facets.payUndisclosed} />
        {SALARY_BUCKETS.map(([key, label]) => {
          const n = facets.salary[key] || 0;
          return <Checkbox key={key} checked={isSalaryChecked(key)} onChange={() => toggleSalary(key)} zero={n === 0} label={label} count={n} />;
        })}
      </Section>

      <Section title="Status">
        <Checkbox checked={f.newOnly} onChange={(e) => updateFilters({ newOnly: e.target.checked })} label="New Since Last Visit" count={facets.newOnly} />
        <Checkbox checked={f.savedOnly} onChange={(e) => updateFilters({ savedOnly: e.target.checked })} label="Saved Only" count={facets.savedOnly} />
        <Checkbox checked={f.hideOpened} onChange={(e) => updateFilters({ hideOpened: e.target.checked })} label="Hide Already Opened" count={facets.hideOpened} />
        <Checkbox checked={f.done} onChange={(e) => updateFilters({ done: e.target.checked })} label="Include Hidden & Applied" count={facets.done} />
      </Section>

      <Section title="Hidden Companies" defaultOpen={false} count={prefs.hiddenCompanies.length || null}>
        {prefs.hiddenCompanies.length ? prefs.hiddenCompanies.map((c) => (
          <div key={c} className="mx-[-6px] flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted transition-colors duration-150 hover:bg-surface-2">
            <span className="min-w-0 flex-1 truncate">{c}</span>
            <button type="button" title="Remove" onClick={() => update((p) => ({ hiddenCompanies: p.hiddenCompanies.filter((x) => x !== c) }))}
              className="grid h-4 w-4 flex-none place-items-center rounded-full text-text-dim transition-colors duration-150 hover:bg-border hover:text-text">
              <IconClose className="h-2.5 w-2.5" strokeWidth={2.4} />
            </button>
          </div>
        )) : (
          <div className="px-3.5 text-[11.5px] text-text-faint">Use ⋯ On A Listing → &ldquo;Hide All From This Company&rdquo;.</div>
        )}
      </Section>

      <Section title="Presets" defaultOpen={false} count={Object.keys(prefs.presets).length || null}>
        <div className="flex items-center gap-1.5 px-3.5 pb-1.5">
          <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && presetName.trim()) { onSavePreset(presetName.trim()); setPresetName(""); } }}
            placeholder="Name Current Filters…"
            className="w-full min-w-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] focus:border-accent focus:outline-none" />
          <button type="button" onClick={() => { if (presetName.trim()) { onSavePreset(presetName.trim()); setPresetName(""); } }}
            className="flex-none rounded-md border border-border px-2.5 py-1.5 text-[12.5px] transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 active:scale-[0.98]">Save</button>
        </div>
        {Object.keys(prefs.presets).map((name) => (
          <label key={name} className="mx-[-6px] flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted transition-colors duration-150 hover:bg-surface-2">
            <input type="radio" name="preset" onChange={() => onApplyPreset(name)} className="accent-accent" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <button type="button" title="Delete Preset" onClick={(e) => { e.preventDefault(); onDeletePreset(name); }}
              className="grid h-4 w-4 flex-none place-items-center rounded-full text-text-dim transition-colors duration-150 hover:bg-border hover:text-text">
              <IconClose className="h-2.5 w-2.5" strokeWidth={2.4} />
            </button>
          </label>
        ))}
      </Section>

      <Section title="Layout" defaultOpen={false}>
        <Checkbox checked={prefs.split} onChange={(e) => update({ split: e.target.checked })} label="Split View: Open Listings In A Right-Half Window" />
        <LabeledSelect label="Board Columns" value={prefs.cols} onChange={(v) => update({ cols: v })}
          options={[["auto", "Auto"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} />
      </Section>

      <div className="flex gap-2 px-3.5 pt-3">
        <button type="button" onClick={onResetFilters} className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 active:scale-[0.98]">
          Reset Filters
        </button>
      </div>
    </aside>
  );
}

function Section({ title, actions, count, defaultOpen = true, children }) {
  return (
    <details open={defaultOpen} className="border-b border-border px-3.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2.5 text-[11px] font-semibold tracking-wide text-text-dim uppercase select-none marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDot />
        {title}
        {count != null && <span className="ml-auto text-[11.5px] font-medium tracking-normal text-text-faint normal-case">{count}</span>}
        {actions && <span className="ml-auto flex gap-1.5 text-[11.5px] font-medium tracking-normal normal-case">{actions}</span>}
      </summary>
      <div className="flex flex-col gap-0.5 pb-3">{children}</div>
    </details>
  );
}

function ChevronDot() {
  // a border-right+border-bottom corner points down at rotate(45deg) and up
  // at rotate(-135deg) -- 135deg (not negative) points *left*, which is the
  // bug being fixed here: closed should read "points down, click to open",
  // open should read "points up, click to close", never sideways.
  return <span className="mr-0.5 inline-block h-1.5 w-1.5 rotate-45 border-r-[1.5px] border-b-[1.5px] border-text-faint transition-transform duration-150 [details[open]_&]:rotate-[-135deg]" />;
}

function ToggleLink({ active, onClick, children }) {
  return (
    <button
      type="button"
      // a summary's own click toggles its <details> open/closed; without
      // preventDefault, clicking this button inside the header would also
      // collapse the section it lives in
      onClick={(e) => { e.preventDefault(); onClick(); }}
      className={cx(
        "px-2.5 py-1 text-[11px] font-bold tracking-normal normal-case transition-colors duration-150 active:scale-95",
        active ? "bg-accent text-white" : "bg-surface-2 text-text-dim hover:bg-border hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Checkbox({ checked, onChange, label, count, dot, warn, zero }) {
  return (
    <label className={cx("mx-[-6px] flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted transition-colors duration-150 hover:bg-surface-2", zero && "opacity-55")}>
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-accent" />
      {dot && <span className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {warn && <span className="text-[11px] text-danger" title={warn}>Error</span>}
      {count != null && <span className="text-[11.5px] tabular-nums text-text-faint">{count}</span>}
    </label>
  );
}

function Radio({ name, value, checked, onChange, label }) {
  return (
    <label className="mx-[-6px] flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted transition-colors duration-150 hover:bg-surface-2">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="accent-accent" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function LabeledSelect({ label, value, onChange, options }) {
  return (
    <label className="mx-[-6px] flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-[12.5px]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

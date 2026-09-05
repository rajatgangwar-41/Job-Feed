"use client";
import { EXP_OPTS, AGE_OPTS, KINDS } from "@/lib/constants";
import { srcName } from "@/lib/format";
import { SALARY_BUCKETS } from "@/lib/salary";
import { CITY_OPTIONS } from "@/lib/cities";
import { IconClose } from "./icons";

export default function FilterChips({ filters: f, serverDefaults, updateFilters, onClearAll }) {
  const chips = [];
  const push = (label, undo) => chips.push({ label, undo });

  if (f.q) push(`“${f.q}”`, () => updateFilters({ q: "" }));
  if (f.sources.length) push(f.sources.includes("__none__") ? "No Sources" : f.sources.map(srcName).join(", "), () => updateFilters({ sources: [] }));
  if (f.kinds.length) push(f.kinds.map((k) => (KINDS.find(([kk]) => kk === k) || [k, k])[1]).join(", "), () => updateFilters({ kinds: [] }));
  const dExp = String(serverDefaults.exp), dAge = String(serverDefaults.age);
  // f.exp/f.age are null for one render before Dashboard's seeding effect
  // learns the server's defaults -- that's not a real choice yet, so it
  // must never render as a chip (a bare `null + "y"` would print "nully").
  if (f.exp != null && f.exp !== dExp) push((EXP_OPTS.find(([v]) => v === f.exp) || [0, f.exp + "y"])[1], () => updateFilters({ exp: dExp }));
  if (f.age != null && f.age !== dAge) push((AGE_OPTS.find(([v]) => v === f.age) || [0, f.age + "d"])[1], () => updateFilters({ age: dAge }));
  if (f.loc) push(`In “${f.loc}”`, () => updateFilters({ loc: "" }));
  if (f.cities.length) push(f.cities.map((k) => (CITY_OPTIONS.find(([kk]) => kk === k) || [k, k])[1]).join(", "), () => updateFilters({ cities: [] }));
  if (f.remote) push("Work From Home", () => updateFilters({ remote: false }));
  if (f.outsideIndia) push("Outside India", () => updateFilters({ outsideIndia: false }));
  if (f.payUndisclosed) push("Undisclosed Pay", () => updateFilters({ payUndisclosed: false }));
  if (f.salary.length) push(f.salary.map((k) => (SALARY_BUCKETS.find(([kk]) => kk === k) || [k, k])[1]).join(", "), () => updateFilters({ salary: [] }));
  if (f.newOnly) push("New Only", () => updateFilters({ newOnly: false }));
  if (f.savedOnly) push("Saved Only", () => updateFilters({ savedOnly: false }));
  if (f.hideOpened) push("Hiding Opened", () => updateFilters({ hideOpened: false }));
  if (f.done) push("Incl. Hidden & Applied", () => updateFilters({ done: false }));

  if (!chips.length) return null;

  return (
    <>
      {chips.map((c, i) => (
        <span key={i} className="animate-pop-in inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent bg-accent-soft py-0.5 pr-1 pl-2.5 text-xs text-accent-text">
          <span className="truncate">{c.label}</span>
          <button type="button" title="Remove" onClick={c.undo} className="grid h-4 w-4 flex-none place-items-center rounded-full transition-colors duration-150 hover:bg-black/10 active:scale-90">
            <IconClose className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={onClearAll} className="animate-pop-in rounded-md px-2 py-0.5 text-xs text-text-dim transition-colors duration-150 hover:bg-surface-2 active:scale-95">Clear All</button>
      )}
    </>
  );
}

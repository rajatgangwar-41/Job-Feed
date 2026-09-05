import { kindOf, hasPay, isRemote, isOutsideIndia, matchQuery, normCo } from "./format";
import { inSalaryBuckets } from "./salary";
import { matchesCity } from "./cities";

// A row passes every filter except the one named in `skip`. Sidebar facet
// counts call this once per option with that option's own key skipped, so
// "23 remote" means "23 rows would remain if you also ticked remote" rather
// than double-counting a filter against itself.
export function passes(j, filters, hiddenSet, isNew, skip) {
  const f = filters;
  if (skip !== "done" && !f.done && (j.closed || j.applied)) return false;
  if (skip !== "sources" && f.sources.length && !f.sources.includes(j.source)) return false;
  if (skip !== "kinds" && f.kinds.length && !f.kinds.includes(kindOf(j))) return false;
  if (skip !== "remote" && f.remote && !isRemote(j)) return false;
  if (skip !== "outsideIndia" && f.outsideIndia && !isOutsideIndia(j)) return false;
  if (skip !== "cities" && f.cities.length && !matchesCity(j, f.cities)) return false;
  if (f.loc && !(j.location || "").toLowerCase().includes(f.loc.toLowerCase())) return false;
  if (skip !== "pay" && f.payUndisclosed && hasPay(j)) return false;
  if (skip !== "salary" && f.salary.length && !inSalaryBuckets(j, f.salary)) return false;
  if (skip !== "newOnly" && f.newOnly && !isNew(j)) return false;
  if (skip !== "savedOnly" && f.savedOnly && !j.saved) return false;
  if (skip !== "hideOpened" && f.hideOpened && j.opened && !j.saved) return false;
  if (skip !== "hiddenCo" && hiddenSet.has(normCo(j.company))) return false;
  if (f.q && !matchQuery(j, f.q)) return false;
  return true;
}

// Whether any filter currently differs from its resting state -- drives the
// "nothing matches the current filters" vs "nothing yet" empty-state copy.
export function hasActiveFilters(f, serverDefaults) {
  return !!(
    f.q || f.sources.length || f.kinds.length ||
    // null means "server default not learned yet" (briefly, before the
    // seeding effect runs), not an actual choice -- never counts as active
    (f.exp != null && f.exp !== String(serverDefaults.exp)) ||
    (f.age != null && f.age !== String(serverDefaults.age)) ||
    f.loc || f.cities.length || f.remote || f.outsideIndia || f.payUndisclosed || f.salary.length ||
    f.newOnly || f.savedOnly || f.hideOpened || f.done
  );
}

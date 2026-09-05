// Quick-pick city filters. Each one is a regex, not a literal string match,
// because the same city shows up under more than one name across sources:
// Gurgaon was officially renamed Gurugram and both spellings are still in
// use; Bangalore/Bengaluru is the same split. Noida/Greater Noida and
// Delhi/New Delhi don't need a second alternative -- "noida" and "delhi"
// already match inside those longer names as whole words.
export const CITY_OPTIONS = [
  ["bangalore", "Bangalore", /bangalore|bengaluru/i],
  ["delhi", "Delhi", /\bdelhi\b/i],
  ["gurgaon", "Gurgaon", /gurgaon|gurugram/i],
  ["noida", "Noida", /\bnoida\b/i],
  ["hyderabad", "Hyderabad", /\bhyderabad\b/i],
];

// Cached per raw location string for the same reason as parsePayLPA in
// salary.js: the sidebar's 5 per-city facet counts otherwise re-run all 5
// regexes against every job's location on every keystroke in search.
const cache = new Map();
function matchedKeys(loc) {
  if (cache.has(loc)) return cache.get(loc);
  const keys = loc ? CITY_OPTIONS.filter(([, , re]) => re.test(loc)).map(([key]) => key) : [];
  cache.set(loc, keys);
  return keys;
}

export function matchesCity(job, cityKeys) {
  const keys = matchedKeys(job.location || "");
  return keys.some((k) => cityKeys.includes(k));
}

import { SRC_COLOR, SRC_NAME, ORDER } from "./constants";

export function ago(ts) {
  const s = Date.now() / 1000 - ts;
  if (s < 90) return "just now";
  if (s < 5400) return Math.round(s / 60) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  return Math.round(s / 86400) + "d";
}

export function absTime(ts) {
  return new Date(ts * 1000).toLocaleString([], {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// A listing's effective timestamp: its real posted time, or when we first
// saw it if the source publishes none (Indeed).
export const when = (j) => j.posted_at || j.first_seen;

export const normCo = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Deterministic fallback color for a source not in the known palette.
export function srcColor(s) {
  if (SRC_COLOR[s]) return SRC_COLOR[s];
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 60% 55%)`;
}
export const srcName = (s) => SRC_NAME[s] || s;

export const kindOf = (j) => (j.tags === "internship" || /\bintern/i.test(j.title || "") ? "internship" : "job");
export const hasPay = (j) => !!j.pay && !/not disclosed|unpaid|best in industry|competitive/i.test(j.pay);
export const isRemote = (j) => /remote|work from home|\bwfh\b/i.test(`${j.location || ""} ${j.title || ""}`);
export const expLabel = (e) => (e === null || e === undefined ? null : e === 0 ? "Fresher" : `${e}y+`);

// Almost every source here is India-only (Internshala, Foundit, Naukri,
// Cutshort); only Wellfound and YC ever list roles elsewhere. A bare
// "Remote" tells you nothing about country, so this only fires on an
// explicit non-Indian marker and never on remote-ness alone -- an unknown
// or ambiguous location is assumed Indian rather than flagged, since that
// matches the overwhelming majority of listings on this board.
const INDIA_RE = /\bindia\b|bengaluru|bangalore|mumbai|delhi|gurugram|gurgaon|noida|hyderabad|\bpune\b|chennai|kolkata|ahmedabad|jaipur|kochi|indore|nagpur|chandigarh|lucknow|\bsurat\b|coimbatore|\bthane\b|nashik|kanchrapara/i;
const NON_INDIA_RE = /\bus\b|\busa\b|united states|\buk\b|united kingdom|\bengland\b|\blondon\b|san francisco|\bnew york\b|\bnyc\b|\baustin\b|\bseattle\b|\bcanada\b|\btoronto\b|singapore|germany|\bpoland\b|australia|\bdubai\b|\buae\b|[,/]\s*(ca|ny|tx|wa|ma|il|gb|pl)\b/i;
// cached per location string -- see the matching note on parsePayLPA in
// salary.js, same "recomputed on every keystroke" problem
const outsideIndiaCache = new Map();
export function isOutsideIndia(j) {
  const loc = j.location || "";
  if (outsideIndiaCache.has(loc)) return outsideIndiaCache.get(loc);
  const result = !!loc && !INDIA_RE.test(loc) && NON_INDIA_RE.test(loc);
  outsideIndiaCache.set(loc, result);
  return result;
}

export const SORT_FNS = {
  newest: (a, b) => when(b) - when(a),
  company: (a, b) => (a.company || "").localeCompare(b.company || "") || when(b) - when(a),
  pay: (a, b) => (Number(hasPay(b)) - Number(hasPay(a))) || when(b) - when(a),
  source: (a, b) => (ORDER.indexOf(a.source) - ORDER.indexOf(b.source)) || when(b) - when(a),
};

// Search: space-separated terms all have to match; a leading "-" excludes.
// The sidebar's ~14 separate facet-count passes each re-check every job
// against the *same* query within one render (skip only ever excludes one
// other filter, never the search box), so without this a single keystroke
// reruns this ~14x per job for no new information. Keyed on the query text
// itself: a new keystroke is a new query, so the cache naturally resets
// instead of growing across a typing session.
let cachedQuery = null;
let cache = new Map();
export function matchQuery(j, q) {
  if (q !== cachedQuery) { cachedQuery = q; cache = new Map(); }
  if (cache.has(j.uid)) return cache.get(j.uid);
  const hay = `${j.title} ${j.company} ${j.location} ${j.tags} ${j.pay}`.toLowerCase();
  let result = true;
  for (const raw of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const neg = raw.startsWith("-");
    const t = neg ? raw.slice(1) : raw;
    if (!t) continue;
    if (hay.includes(t) === neg) { result = false; break; }
  }
  cache.set(j.uid, result);
  return result;
}

// A poll's wall-clock length. Seconds below a minute, m:ss above it -- the
// number is read to answer "does a poll still fit inside its interval", so a
// bare "247s" would make the reader do the division themselves.
export function duration(secs) {
  if (secs == null) return null;
  const s = Math.max(0, Math.round(secs));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

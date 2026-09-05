// Every source formats pay differently -- Internshala writes Indian-style
// absolute rupees ("₹ 3,50,000 - 6,00,000 /year"), Foundit/Naukri write
// Lacs/LPA ("9-12 Lacs PA"), Cutshort suffixes each number with a bare "L"
// ("₹12L - ₹25L / yr"), and Wellfound/YC quote US dollars per year, with
// equity tacked on after a "•" that must not be parsed as more salary
// numbers. Naukri also mixes absolute and Lacs *within one range*
// ("50,000-3 Lacs PA" = ₹50,000 to ₹3,00,000). None of this is structured
// data server-side, so this is a best-effort heuristic, in the same spirit
// as hasPay()/isRemote() in format.js -- good enough to bucket a listing,
// not a promise the number is exact.
const USD_TO_INR = 83; // fixed approximate rate; only changes which bucket a $ listing lands in, not shown anywhere

export const SALARY_BUCKETS = [
  ["0-3", "0 – 3 LPA", 0, 3],
  ["3-6", "3 – 6 LPA", 3, 6],
  ["6-10", "6 – 10 LPA", 6, 10],
  ["10-15", "10 – 15 LPA", 10, 15],
  ["15+", "15+ LPA", 15, Infinity],
];

const UNPAID_RE = /not disclosed|unpaid|best in industry|competitive/i;

// The sidebar recomputes every facet count (sources, salary buckets, cities,
// ...) on every keystroke in search, and each of the 5 salary-bucket counts
// re-scans every job -- that's this function running ~5x per job per
// keystroke otherwise. It's a pure function of the raw string, so a plain
// cache is safe and turns repeats into a lookup instead of a fresh regex
// scan; there are only ever as many distinct `pay` strings as there are
// listings, so this never meaningfully grows.
const cache = new Map();

/** Parse a raw `pay` string into an approximate {min, max} range in LPA (lakhs per annum, INR-equivalent), or null if it can't be read as a number at all. */
export function parsePayLPA(pay) {
  if (!pay) return null;
  if (cache.has(pay)) return cache.get(pay);
  const result = computePayLPA(pay);
  cache.set(pay, result);
  return result;
}

function computePayLPA(pay) {
  if (UNPAID_RE.test(pay)) return null;

  const salaryPart = pay.split("•")[0]; // drop Wellfound's "• 0.01% – 0.1%" equity suffix
  const isUsd = /\$/.test(salaryPart);
  const isMonthly = /\/\s*mo(nth)?\b|per\s*month|a\s*month/i.test(salaryPart);
  const isLakh = /\blacs?\b|\blakhs?\b|\blpa\b/i.test(salaryPart) || /\d\s*l\b/i.test(salaryPart);
  // "\bk\b" doesn't match here: in "45k" there's no word boundary between
  // the digit and the k (both are word characters) -- the boundary that
  // matters is the *end* of the k, not a standalone "k" word.
  const isThousand = !isLakh && /\d\s*k\b/i.test(salaryPart);

  const numbers = [...salaryPart.matchAll(/\d[\d,]*\.?\d*/g)]
    .map((m) => m[0])
    .map((raw) => {
      const clean = raw.replace(/,/g, "");
      const value = parseFloat(clean);
      if (Number.isNaN(value)) return null;
      // an absolute rupee figure (comma-grouped, e.g. "50,000") stays literal
      // even inside an otherwise Lacs-denominated range -- Naukri does this
      const looksAbsolute = raw.includes(",") && value >= 1000;
      let rupees;
      if (looksAbsolute) rupees = value;
      else if (isLakh) rupees = value * 100000;
      else if (isThousand) rupees = value * 1000;
      else rupees = value;
      if (isUsd) rupees *= USD_TO_INR;
      if (isMonthly) rupees *= 12;
      return rupees / 100000; // -> LPA
    })
    .filter((n) => n !== null && n > 0);

  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

/** Whether a job's parsed pay range overlaps any of the given bucket keys. */
export function inSalaryBuckets(job, bucketKeys) {
  const range = parsePayLPA(job.pay);
  if (!range) return false;
  return SALARY_BUCKETS.some(([key, , bMin, bMax]) => bucketKeys.includes(key) && range.min < bMax && range.max >= bMin);
}

// Raw pay strings are ugly and inconsistent ("₹ 5,000 /month", "9-12 Lacs
// PA", "$50K - $70K • 0.01% – 0.1%"). This normalizes every one of them into
// a single clean "₹X – Y LPA" (or "$XK – YK" for dollar-quoted listings --
// Wellfound/YC roles outside India) so the card always shows an annualized,
// glanceable figure instead of whatever format the source happened to use.
// Kept in the pay string's own currency rather than converting $ -> ₹, since
// that conversion is only meant to be a bucketing approximation (see
// USD_TO_INR above), not something to show as a fact on a listing.
const displayCache = new Map();

export function formatPayDisplay(pay) {
  if (!pay) return null;
  if (displayCache.has(pay)) return displayCache.get(pay);
  const result = computeFormatPay(pay);
  displayCache.set(pay, result);
  return result;
}

function computeFormatPay(pay) {
  if (UNPAID_RE.test(pay)) return null;

  const salaryPart = pay.split("•")[0];
  const isUsd = /\$/.test(salaryPart);
  const isMonthly = /\/\s*mo(nth)?\b|per\s*month|a\s*month/i.test(salaryPart);
  const isLakh = /\blacs?\b|\blakhs?\b|\blpa\b/i.test(salaryPart) || /\d\s*l\b/i.test(salaryPart);
  const isThousand = !isLakh && /\d\s*k\b/i.test(salaryPart);

  const numbers = [...salaryPart.matchAll(/\d[\d,]*\.?\d*/g)]
    .map((m) => m[0])
    .map((raw) => {
      const clean = raw.replace(/,/g, "");
      const value = parseFloat(clean);
      if (Number.isNaN(value)) return null;
      const looksAbsolute = raw.includes(",") && value >= 1000;
      // Natural annual units: LPA for rupees, $K for dollars -- never
      // cross-converted, so what's shown is always in the source's own currency.
      let units;
      if (isUsd) units = isThousand ? value : value / 1000;
      else if (looksAbsolute) units = value / 100000;
      else if (isLakh) units = value;
      else if (isThousand) units = value / 100;
      else units = value;
      if (isMonthly) units *= 12;
      return units;
    })
    .filter((n) => n !== null && n > 0);

  if (!numbers.length) return null;
  const min = Math.min(...numbers), max = Math.max(...numbers);
  return { isUsd, min, max };
}

const round1 = (n) => Math.round(n * 10) / 10;
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(round1(n)));

/** Formatted display string for a job's pay, or null if it can't be read as a number. */
export function payText(pay) {
  const r = formatPayDisplay(pay);
  if (!r) return null;
  const unit = r.isUsd ? "K" : " LPA";
  const symbol = r.isUsd ? "$" : "₹";
  const lo = fmtNum(r.min), hi = fmtNum(r.max);
  // Compare the *rounded display strings*, not the raw floats -- a range like
  // "1.8 - 1.8 LPA" from the source can parse to two floats a hair apart
  // (different unit-conversion paths for the same value), which would still
  // show as a pointless range even though there's nothing to range between.
  if (lo === hi) return `${symbol}${lo}${unit}`;
  return r.isUsd
    ? `${symbol}${lo}${unit} – ${symbol}${hi}${unit}`
    : `${symbol}${lo} – ${hi}${unit}`;
}

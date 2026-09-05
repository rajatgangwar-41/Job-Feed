// Fixed left-to-right column order on the board; anything the config adds
// later that isn't in this list falls back to alphabetical, appended.
export const ORDER = ["internshala", "foundit", "naukri", "indeed", "cutshort", "wellfound", "yc"];

// Best-effort match to each site's actual brand color (not a promise these
// are pixel-exact, brands update palettes) -- picked so the ones that are
// genuinely close in hue (three blues here) still read apart at a glance.
export const SRC_COLOR = {
  internshala: "#0ea5e9", // sky blue, their own brand blue
  foundit: "#f43f5e", // coral/rose, foundit's post-Monster.com rebrand
  naukri: "#1d4ed8", // deep blue -- their well-known brand blue, not orange
  indeed: "#2164f3", // Indeed's own vivid blue, distinct from Naukri's
  cutshort: "#14b8a6", // teal
  wellfound: "#65a30d", // olive/lime -- their black+lime rebrand, darkened for white-text contrast
  yc: "#ea580c", // Y Combinator's iconic orange
  manual: "#64748b", // slate -- deliberately the quietest chip on the board,
  // because a hand-entered listing is not a source you can go back and scrape.
};

export const SRC_NAME = {
  yc: "Y Combinator", internshala: "Internshala", foundit: "Foundit", naukri: "Naukri",
  indeed: "Indeed", cutshort: "Cutshort", wellfound: "Wellfound",
  manual: "Added By You",
};

export const KINDS = [
  ["job", "Full Time"],
  ["internship", "Internships"],
];

// Each option is a *ceiling*, not a discrete bucket -- the backend filter is
// "exp_min <= N" (see backend/store.py), so "Up to 2 years" already includes
// fresher and 1-year listings too. A "< 1 Year" / "< 2 Years" style label
// reads as disjoint ranges and is actively misleading here: a fresher role
// would look like it belongs only in the first row when it actually
// satisfies every row from "Fresher" up to "Any experience".
export const EXP_OPTS = [
  ["0", "Fresher Only"],
  ["1", "Up To 1 Year"],
  ["2", "Up To 2 Years"],
  ["3", "Up To 3 Years"],
  ["any", "Any Experience"],
];

export const AGE_OPTS = [
  ["0.25", "Last 6 Hours"],
  ["1", "Last 24 Hours"],
  ["2", "Last 2 Days"],
  ["7", "Last 7 Days"],
  ["any", "Any Age"],
];

export const DEFAULT_FILTERS = {
  sources: [], kinds: [], exp: null, age: null, loc: "", cities: [], remote: false, outsideIndia: false,
  payUndisclosed: false, salary: [], newOnly: false, savedOnly: false, hideOpened: false, done: false, q: "",
};

export const DEFAULT_PREFS = {
  view: "board", density: "cozy", theme: "auto", split: true, cols: "auto", sort: "newest",
  sideHidden: false, filters: { ...DEFAULT_FILTERS }, hiddenCompanies: [], presets: {},
  trackerTab: "pipeline",
};

export const PREFS_KEY = "jobfeed.prefs.v2";


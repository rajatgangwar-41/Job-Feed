import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Mirrors backend/store.py's SQLite schema, with one structural change: the
// SQLite `jobs` row carries the flags (saved/applied/flagged/closed/opened,
// notes, stage) inline, because that database only ever had one user. Here
// those move to `userJobs`, so the scraped pool is shared and every person
// gets their own board over the top of it.
//
// Field names stay snake_case to match what the scraper emits and what the
// whole frontend already reads (`first_seen`, `posted_at`, `exp_min`).
// Renaming them to camelCase would be a churn sweep across every filter,
// formatter and component for no behavioural gain.
export default defineSchema({
  // One row per person, created on first sign-in. Identity is captured from
  // the Clerk token rather than sent up by the client, so email and name
  // cannot be spoofed by a caller -- but Clerk stays the source of truth for
  // them, and these are a convenience copy for anything that wants to show
  // who a row belongs to without a round trip to Clerk.
  //
  // `prefs` is the whole preference object the board used to keep in
  // localStorage: view, density, theme, filters, saved presets, hidden
  // companies. Stored as one opaque blob on purpose -- it is read and
  // written whole, never queried by field, and pinning a schema to it would
  // mean a migration every time the UI grows a toggle.
  users: defineTable({
    userId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    prefs: v.optional(v.any()),
    createdAt: v.number(),
    // "New since last visit" badges compare against these two. They used to
    // be localStorage keys, which made "last visit" mean "last visit on this
    // browser" -- from here it means the last time you looked at the board
    // at all, on any device.
    lastLoadAt: v.optional(v.number()),
    visitStartAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // The shared scraped pool. Written only by the poller, through the
  // authenticated HTTP action in http.js -- never by a signed-in user.
  jobs: defineTable({
    uid: v.string(),
    source: v.string(),
    title: v.optional(v.string()),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    pay: v.optional(v.string()),
    posted: v.optional(v.string()),
    posted_at: v.optional(v.union(v.number(), v.null())),
    exp_min: v.optional(v.union(v.number(), v.null())),
    url: v.optional(v.string()),
    tags: v.optional(v.string()),
    desc_checked: v.optional(v.union(v.number(), v.null())),
    first_seen: v.number(),
    // COALESCE(posted_at, first_seen), stored rather than derived so the
    // feed can sort and range-filter on a single indexed field instead of
    // computing it for every row it reads.
    when: v.number(),
  })
    .index("by_uid", ["uid"])
    .index("by_when", ["when"]),

  // One row per (person, listing) they have ever touched. Absent means
  // untouched, so the table stays proportional to what someone actually
  // marks rather than to the size of the pool.
  userJobs: defineTable({
    userId: v.string(),
    uid: v.string(),
    saved: v.optional(v.number()),
    applied: v.optional(v.number()),
    applied_at: v.optional(v.union(v.number(), v.null())),
    flagged: v.optional(v.number()),
    closed: v.optional(v.number()),
    opened: v.optional(v.number()),
    notes: v.optional(v.string()),
    stage: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_user", ["userId"])
    .index("by_user_uid", ["userId", "uid"]),

  // The Kanban columns, per person. `kind` marks the two columns the flags
  // care about ("saved" / "rejected"); every other column means applied.
  stages: defineTable({
    userId: v.string(),
    stageId: v.string(),
    name: v.string(),
    kind: v.union(v.string(), v.null()),
    color: v.string(),
    ord: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_stage", ["userId", "stageId"]),

  // One row per stage a job has ever entered. Never pruned, so the funnel
  // can answer "how many reached OA" from everyone who passed through it
  // rather than whoever is sitting there today.
  stageEvents: defineTable({
    userId: v.string(),
    uid: v.string(),
    stage: v.string(),
    ts: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_uid", ["userId", "uid"]),

  // Poller telemetry, global: one row per source, plus a single state row.
  runs: defineTable({
    source: v.string(),
    ts: v.number(),
    found: v.optional(v.number()),
    added: v.optional(v.number()),
    error: v.optional(v.union(v.string(), v.null())),
  }).index("by_source", ["source"]),

  pollState: defineTable({
    lastPoll: v.number(),
    running: v.boolean(),
    pollMinutes: v.number(),
    // The scraper's own config filters, pushed along with a run. The sidebar
    // seeds its experience/age radios from these, so the board's defaults
    // keep coming from whatever the poller is actually configured to fetch.
    filters: v.optional(v.any()),
  }),
});

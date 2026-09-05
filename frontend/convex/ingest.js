import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// The write path for the scraper. Internal-only: it is unreachable from a
// browser, and the HTTP action in http.js is the single door into it, behind
// a shared secret. Nothing here is scoped to a user -- the listing pool is
// shared, and per-user state is written only by board.js.

const jobShape = v.object({
  uid: v.string(),
  source: v.string(),
  title: v.optional(v.union(v.string(), v.null())),
  company: v.optional(v.union(v.string(), v.null())),
  location: v.optional(v.union(v.string(), v.null())),
  pay: v.optional(v.union(v.string(), v.null())),
  posted: v.optional(v.union(v.string(), v.null())),
  posted_at: v.optional(v.union(v.number(), v.null())),
  exp_min: v.optional(v.union(v.number(), v.null())),
  url: v.optional(v.union(v.string(), v.null())),
  tags: v.optional(v.union(v.string(), v.null())),
  desc_checked: v.optional(v.union(v.number(), v.null())),
  first_seen: v.number(),
});

const clean = (s) => (s == null ? undefined : s);

export const push = internalMutation({
  args: {
    jobs: v.array(jobShape),
    runs: v.optional(v.array(v.object({
      source: v.string(), ts: v.number(),
      found: v.optional(v.number()), added: v.optional(v.number()),
      error: v.optional(v.union(v.string(), v.null())),
    }))),
    lastPoll: v.optional(v.number()),
    running: v.optional(v.boolean()),
    pollMinutes: v.optional(v.number()),
    filters: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    let added = 0, updated = 0;
    for (const j of args.jobs) {
      const existing = await ctx.db.query("jobs")
        .withIndex("by_uid", (ix) => ix.eq("uid", j.uid)).unique();
      const doc = {
        uid: j.uid, source: j.source,
        title: clean(j.title), company: clean(j.company), location: clean(j.location),
        pay: clean(j.pay), posted: clean(j.posted), url: clean(j.url), tags: clean(j.tags),
        posted_at: j.posted_at ?? null, exp_min: j.exp_min ?? null,
        desc_checked: j.desc_checked ?? null,
        first_seen: j.first_seen,
        when: j.posted_at ?? j.first_seen,
      };
      if (existing) {
        // first_seen is the scraper's, and it is the older of the two by
        // definition -- never let a re-push move a listing's age forward.
        await ctx.db.patch(existing._id, { ...doc, first_seen: Math.min(existing.first_seen, j.first_seen) });
        updated += 1;
      } else {
        await ctx.db.insert("jobs", doc);
        added += 1;
      }
    }

    for (const r of args.runs ?? []) {
      const existing = await ctx.db.query("runs")
        .withIndex("by_source", (ix) => ix.eq("source", r.source)).unique();
      const doc = { source: r.source, ts: r.ts, found: r.found ?? 0, added: r.added ?? 0, error: r.error ?? null };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("runs", doc);
    }

    const state = await ctx.db.query("pollState").first();
    const patch = {};
    if (args.lastPoll !== undefined) patch.lastPoll = args.lastPoll;
    if (args.running !== undefined) patch.running = args.running;
    if (args.pollMinutes !== undefined) patch.pollMinutes = args.pollMinutes;
    if (args.filters !== undefined) patch.filters = args.filters;
    if (state) await ctx.db.patch(state._id, patch);
    else await ctx.db.insert("pollState", {
      lastPoll: patch.lastPoll ?? 0, running: patch.running ?? false,
      pollMinutes: patch.pollMinutes ?? 15, filters: patch.filters,
    });

    return { added, updated };
  },
});

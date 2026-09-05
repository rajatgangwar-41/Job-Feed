import { query } from "./_generated/server";
import { v } from "convex/values";
import { optionalUser } from "./lib/auth";
import { DEFAULT_STAGES } from "./lib/stages";

const DAY = 86400;
// A ceiling on how much of the pool one request reads. The scraper caps its
// push per source, so this only ever bites after many months of history.
const MAX_ROWS = 2000;
// Per-person caps. These exist so a board that has been used for years
// cannot turn one query into an unbounded scan; they are far above what a
// real tracker reaches.
const MAX_TOUCHED = 5000;
const MAX_EVENTS = 10000;
const MAX_STAGES = 200;
const MAX_RUNS = 100;

// What an unauthenticated caller gets. Convex queries are reachable by name
// from anywhere -- the deployment URL ships in every browser -- so "the
// dashboard is behind a route guard" protects nothing here; the handler has
// to. Same shape as a real payload so the client needs no special case,
// but carrying none of the scraper's configuration (its keyword lists and
// excluded companies) and none of its per-source telemetry, which are a
// signed-in user's business and nobody else's.
const SIGNED_OUT = {
  authed: false,
  jobs: [], stages: [], funnel: {}, history: {},
  filters: {}, last_poll: 0, running: false, poll_minutes: 15,
  status: { runs: [], open: 0, saved: 0, applied_24h: 0, applied_7d: 0, applied_all: 0 },
};

// One reactive query standing in for the whole of GET /api/feed. Returning
// the identical payload shape means the dashboard's data plumbing did not
// have to change when the source moved from a polled HTTP endpoint to a
// live Convex subscription -- and because it is one query, a mark, a note
// and a stage move all re-render from a single consistent read rather than
// four requests that can disagree.
export const get = query({
  args: {
    maxAgeDays: v.union(v.number(), v.null()),
    maxExpYears: v.union(v.number(), v.null()),
    // Passed in rather than read here. A query is not rerun because time
    // advanced, so a clock read inside one goes stale -- the age cutoff
    // would stop moving and the 24h/7d counters would freeze. The client
    // supplies this rounded to the minute, which also keeps the query cache
    // useful instead of missing on every distinct millisecond.
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await optionalUser(ctx);
    // Return before reading anything. Bailing out here rather than blanking
    // fields at the end means the config and telemetry are never loaded for
    // a caller who is not entitled to them, instead of being read and then
    // remembered to be stripped.
    if (!userId) return SIGNED_OUT;

    const now = args.now;
    const state = await ctx.db.query("pollState").first();
    const runs = (await ctx.db.query("runs").take(MAX_RUNS))
      .map(({ source, ts, found, added, error }) => ({ source, ts, found, added, error: error ?? null }));

    const base = {
      authed: true,
      stages: [], funnel: {}, history: {},
      filters: state?.filters ?? {},
      last_poll: state?.lastPoll ?? 0,
      running: state?.running ?? false,
      poll_minutes: state?.pollMinutes ?? 15,
      status: { runs, open: 0, saved: 0, applied_24h: 0, applied_7d: 0, applied_all: 0 },
    };
    const cutoff = args.maxAgeDays ? now - args.maxAgeDays * DAY : null;
    const rows = await (cutoff == null
      ? ctx.db.query("jobs").withIndex("by_when").order("desc")
      : ctx.db.query("jobs").withIndex("by_when", (ix) => ix.gte("when", cutoff)).order("desc")
    ).take(MAX_ROWS);

    // Unknown experience passes, matching the SQL this replaces: Indeed
    // publishes none and is filtered at the URL instead.
    const maxExp = args.maxExpYears;
    const listings = maxExp == null
      ? rows
      : rows.filter((r) => r.exp_min == null || r.exp_min <= maxExp);

    const mine = await ctx.db.query("userJobs")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_TOUCHED);
    const byUid = new Map(mine.map((u) => [u.uid, u]));

    const jobs = listings.map((r) => {
      const u = byUid.get(r.uid);
      return {
        uid: r.uid, source: r.source, title: r.title, company: r.company,
        location: r.location, pay: r.pay, posted: r.posted,
        posted_at: r.posted_at ?? null, exp_min: r.exp_min ?? null,
        url: r.url, tags: r.tags, desc_checked: r.desc_checked ?? null,
        first_seen: r.first_seen,
        saved: u?.saved ?? 0, applied: u?.applied ?? 0,
        applied_at: u?.applied_at ?? null, flagged: u?.flagged ?? 0,
        closed: u?.closed ?? 0, opened: u?.opened ?? 0,
        notes: u?.notes ?? "", stage: u?.stage ?? null,
      };
    });

    const stageRows = (await ctx.db.query("stages")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_STAGES))
      .sort((a, b) => a.ord - b.ord);
    const stages = stageRows.length
      ? stageRows.map((s) => ({ id: s.stageId, name: s.name, kind: s.kind, color: s.color }))
      : DEFAULT_STAGES.map((s) => ({ id: s.stageId, name: s.name, kind: s.kind, color: s.color }));

    // Distinct jobs per stage ever entered, plus each job's own path -- a
    // rejected job's furthest stage lives nowhere else.
    const events = await ctx.db.query("stageEvents")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_EVENTS);
    events.sort((a, b) => a.ts - b.ts);
    const seen = {}, history = {};
    for (const e of events) {
      (seen[e.stage] ??= new Set()).add(e.uid);
      (history[e.uid] ??= []).push([e.stage, e.ts]);
    }
    const funnel = Object.fromEntries(Object.entries(seen).map(([k, s]) => [k, s.size]));

    let open = 0, saved = 0, applied24 = 0, applied7 = 0, appliedAll = 0;
    for (const j of jobs) if (!j.closed && !j.applied) open += 1;
    for (const u of mine) {
      if (u.saved && !u.applied && !u.closed) saved += 1;
      if (u.applied) {
        appliedAll += 1;
        if (u.applied_at != null && u.applied_at >= now - DAY) applied24 += 1;
        if (u.applied_at != null && u.applied_at >= now - 7 * DAY) applied7 += 1;
      }
    }

    return {
      ...base, jobs, stages, funnel, history,
      status: { runs, open, saved, applied_24h: applied24, applied_7d: applied7, applied_all: appliedAll },
    };
  },
});

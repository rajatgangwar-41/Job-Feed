import { query } from "./_generated/server";
import { v } from "convex/values";
import { isAdminId, optionalUser, requireAdmin } from "./lib/auth";
import { DEFAULT_STAGES } from "./lib/stages";

// Operator-only reads across every account. Each one calls requireAdmin
// first, so the allowlist -- not the route, not the UI -- is what actually
// keeps this closed: the page could be found and it would still answer
// nothing.
const DAY = 86400;
const MAX_PEOPLE = 200;
const MAX_TOUCHED = 5000;
const MAX_EVENTS = 10000;
const MAX_STAGES = 200;

// Cheap enough to call from a server component before rendering, so the
// admin route can 404 rather than render an empty shell.
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await optionalUser(ctx);
    return !!userId && isAdminId(userId);
  },
});

async function stagesFor(ctx, userId) {
  const rows = (await ctx.db.query("stages")
    .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_STAGES))
    .sort((a, b) => a.ord - b.ord);
  return rows.length
    ? rows.map((s) => ({ id: s.stageId, name: s.name, kind: s.kind, color: s.color }))
    : DEFAULT_STAGES.map((s) => ({ id: s.stageId, name: s.name, kind: s.kind, color: s.color }));
}

// The people list, with just enough per row to decide who is worth opening.
export const people = query({
  // `now` comes from the caller for the same reason it does on the board's
  // own feed: a clock read inside a query does not move when time does.
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(MAX_PEOPLE);

    const out = [];
    for (const u of users) {
      const mine = await ctx.db.query("userJobs")
        .withIndex("by_user", (ix) => ix.eq("userId", u.userId)).take(MAX_TOUCHED);
      const stages = await stagesFor(ctx, u.userId);
      const rejectedId = stages.find((s) => s.kind === "rejected")?.id;

      let tracked = 0, applied = 0, rejected = 0, applied7 = 0;
      for (const r of mine) {
        if (r.stage) tracked += 1;
        if (r.applied) {
          applied += 1;
          if (r.applied_at != null && r.applied_at >= now - 7 * DAY) applied7 += 1;
        }
        if (rejectedId && r.stage === rejectedId) rejected += 1;
      }
      out.push({
        userId: u.userId, email: u.email ?? null, name: u.name ?? null,
        createdAt: u.createdAt, lastLoadAt: u.lastLoadAt ?? null,
        tracked, applied, rejected, applied7,
      });
    }
    out.sort((a, b) => (b.lastLoadAt ?? 0) - (a.lastLoadAt ?? 0));
    return out;
  },
});

// One person's tracker, in exactly the shape the board's own analytics
// expect -- so the admin view renders through the same GraphView the owner
// sees, rather than a second implementation that can drift from it. Only
// listings they have actually touched are returned; the shared pool is not
// part of anyone's tracker.
export const board = query({
  // `userId` selects whose board to read; it is never what authorises the
  // read. requireAdmin decides that from the caller's own identity.
  args: { userId: v.string(), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    await requireAdmin(ctx);

    const mine = await ctx.db.query("userJobs")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_TOUCHED);
    const stages = await stagesFor(ctx, userId);

    const jobs = [];
    for (const u of mine) {
      const j = await ctx.db.query("jobs")
        .withIndex("by_uid", (ix) => ix.eq("uid", u.uid)).unique();
      // A listing can age out of the pool while someone still tracks it --
      // keep the row so their funnel still counts it.
      jobs.push({
        uid: u.uid,
        source: j?.source ?? "unknown", title: j?.title ?? "(listing no longer in the pool)",
        company: j?.company ?? null, location: j?.location ?? null, pay: j?.pay ?? null,
        posted_at: j?.posted_at ?? null, exp_min: j?.exp_min ?? null,
        url: j?.url ?? null, tags: j?.tags ?? null,
        first_seen: j?.first_seen ?? u.applied_at ?? 0,
        saved: u.saved ?? 0, applied: u.applied ?? 0, applied_at: u.applied_at ?? null,
        flagged: u.flagged ?? 0, closed: u.closed ?? 0, opened: u.opened ?? 0,
        notes: u.notes ?? "", stage: u.stage ?? null,
      });
    }

    const events = await ctx.db.query("stageEvents")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_EVENTS);
    events.sort((a, b) => a.ts - b.ts);
    const seen = {}, history = {};
    for (const e of events) {
      (seen[e.stage] ??= new Set()).add(e.uid);
      (history[e.uid] ??= []).push([e.stage, e.ts]);
    }

    const person = (await ctx.db.query("users")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).unique()) ?? null;
    const status = {
      runs: [], open: 0,
      saved: mine.filter((r) => r.saved && !r.applied && !r.closed).length,
      applied_24h: mine.filter((r) => r.applied && (r.applied_at ?? 0) >= now - DAY).length,
      applied_7d: mine.filter((r) => r.applied && (r.applied_at ?? 0) >= now - 7 * DAY).length,
      applied_all: mine.filter((r) => r.applied).length,
    };

    return {
      person: person && { email: person.email ?? null, name: person.name ?? null, createdAt: person.createdAt },
      jobs, stages, status,
      funnel: Object.fromEntries(Object.entries(seen).map(([k, s]) => [k, s.size])),
      history,
    };
  },
});

// What a report actually wants: the shape of the market across everyone,
// with no individual named. Counted over accounts that have tracked at
// least one listing, so dormant sign-ups do not drag every rate down.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(MAX_PEOPLE);

    const bySource = {}, byCompany = {}, byStageName = {};
    let people = 0, active = 0, applications = 0, rejections = 0, responded = 0;

    for (const u of users) {
      people += 1;
      const mine = await ctx.db.query("userJobs")
        .withIndex("by_user", (ix) => ix.eq("userId", u.userId)).take(MAX_TOUCHED);
      if (!mine.some((r) => r.stage)) continue;
      active += 1;

      const stages = await stagesFor(ctx, u.userId);
      const order = new Map(stages.map((s, i) => [s.id, i]));
      const rejectedId = stages.find((s) => s.kind === "rejected")?.id;
      const appliedIdx = stages.findIndex((s) => s.kind !== "saved" && s.kind !== "rejected");
      const nameOf = new Map(stages.map((s) => [s.id, s.name]));

      const events = await ctx.db.query("stageEvents")
        .withIndex("by_user", (ix) => ix.eq("userId", u.userId)).take(MAX_EVENTS);
      const furthest = new Map();
      for (const e of events) {
        if (e.stage === rejectedId) continue;
        const i = order.get(e.stage) ?? -1;
        if (i > (furthest.get(e.uid) ?? -1)) furthest.set(e.uid, i);
      }

      for (const r of mine) {
        if (r.stage) {
          const label = nameOf.get(r.stage) || r.stage;
          byStageName[label] = (byStageName[label] || 0) + 1;
        }
        if (!r.applied) continue;
        applications += 1;
        if (rejectedId && r.stage === rejectedId) rejections += 1;
        const idx = Math.max(furthest.get(r.uid) ?? -1, order.get(r.stage) ?? -1);
        if (appliedIdx >= 0 && idx > appliedIdx) responded += 1;

        const j = await ctx.db.query("jobs")
          .withIndex("by_uid", (ix) => ix.eq("uid", r.uid)).unique();
        if (j?.source) bySource[j.source] = (bySource[j.source] || 0) + 1;
        if (j?.company) byCompany[j.company] = (byCompany[j.company] || 0) + 1;
      }
    }

    const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([key, count]) => ({ key, count }));
    const pct = (k) => (applications ? Math.round((k / applications) * 100) : null);

    return {
      people, active, applications,
      responded, respondedPct: pct(responded),
      rejections, rejectionsPct: pct(rejections),
      bySource: top(bySource, 10),
      topCompanies: top(byCompany, 12),
      byStage: top(byStageName, 12),
    };
  },
});

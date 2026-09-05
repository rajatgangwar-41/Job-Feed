import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import { DEFAULT_STAGES, flagsForStage } from "./lib/stages";

// A person's own row for a listing, created on first touch. Rows are keyed
// by (userId, uid) and userId always comes from the verified Clerk identity,
// never from an argument -- so there is no shape of call that reaches
// somebody else's board.
async function myRow(ctx, userId, uid) {
  return await ctx.db.query("userJobs")
    .withIndex("by_user_uid", (ix) => ix.eq("userId", userId).eq("uid", uid))
    .unique();
}

async function patchRow(ctx, userId, uid, patch) {
  const row = await myRow(ctx, userId, uid);
  if (row) {
    await ctx.db.patch(row._id, patch);
    return row._id;
  }
  return await ctx.db.insert("userJobs", { userId, uid, ...patch });
}

const MAX_EVENTS = 10000;
const FLAGS = ["saved", "applied", "flagged", "closed", "opened"];

export const mark = mutation({
  args: { uid: v.string(), field: v.string(), value: v.number() },
  handler: async (ctx, { uid, field, value }) => {
    const userId = await requireUser(ctx);
    if (!FLAGS.includes(field)) throw new Error(`unknown field: ${field}`);
    const on = value ? 1 : 0;
    const patch = { [field]: on };
    // Applying stamps the time the board's "applied in 24h" counters read;
    // undoing it clears the stamp rather than leaving a stale one behind.
    if (field === "applied") patch.applied_at = on ? Date.now() / 1000 : null;
    await patchRow(ctx, userId, uid, patch);
    return true;
  },
});

export const setNote = mutation({
  args: { uid: v.string(), text: v.string() },
  handler: async (ctx, { uid, text }) => {
    const userId = await requireUser(ctx);
    await patchRow(ctx, userId, uid, { notes: text });
    return true;
  },
});

export const setStage = mutation({
  args: { uid: v.string(), stage: v.union(v.string(), v.null()) },
  handler: async (ctx, { uid, stage }) => {
    const userId = await requireUser(ctx);
    const row = await myRow(ctx, userId, uid);
    const now = Date.now() / 1000;

    if (stage === null) {
      // Off the board entirely: the flags the columns imply go with it.
      if (row) await ctx.db.patch(row._id, { stage: null, saved: 0, applied: 0, flagged: 0, applied_at: null });
      return true;
    }

    const persisted = await ctx.db.query("stages")
      .withIndex("by_user_stage", (ix) => ix.eq("userId", userId).eq("stageId", stage))
      .unique();
    const kind = persisted
      ? persisted.kind
      : DEFAULT_STAGES.find((s) => s.stageId === stage)?.kind ?? null;
    if (!persisted && !DEFAULT_STAGES.some((s) => s.stageId === stage)) {
      throw new Error(`unknown stage: ${stage}`);
    }

    const changed = row?.stage !== stage;
    await patchRow(ctx, userId, uid, { stage, ...flagsForStage(kind, row?.applied_at, now) });
    // History records real movement only, so re-dropping a card on the
    // column it already sits in does not inflate the funnel.
    if (changed) await ctx.db.insert("stageEvents", { userId, uid, stage, ts: now });
    return true;
  },
});

// ---------------------------------------------------------------- manual
// A listing the person applied to somewhere this board does not scrape.
//
// It is written to `userJobs`, never to `jobs`. `jobs` is the shared pool
// every signed-in board reads, so putting a personal entry there would show
// one person's off-platform application to everyone. Keeping it on the row
// that already scopes to a user means it is private by construction rather
// than by remembering to filter it.
const CUSTOM = {
  title: v.string(),
  company: v.optional(v.string()),
  location: v.optional(v.string()),
  pay: v.optional(v.string()),
  url: v.optional(v.string()),
  exp_min: v.optional(v.union(v.number(), v.null())),
  tags: v.optional(v.string()),
  via: v.optional(v.string()),
  applied_at: v.optional(v.union(v.number(), v.null())),
};

export const addManual = mutation({
  args: { ...CUSTOM, stage: v.optional(v.string()), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("a title is required");

    const now = Date.now() / 1000;
    const stage = args.stage || "applied";
    const persisted = await ctx.db.query("stages")
      .withIndex("by_user_stage", (ix) => ix.eq("userId", userId).eq("stageId", stage))
      .unique();
    const known = persisted || DEFAULT_STAGES.find((s) => s.stageId === stage);
    if (!known) throw new Error(`unknown stage: ${stage}`);

    // Random rather than a counter: two tabs adding at once must not collide,
    // and the id is never anything but an opaque key.
    const uid = `manual:${now.toFixed(3)}-${Math.random().toString(36).slice(2, 10)}`;
    const applied_at = args.applied_at ?? now;

    await ctx.db.insert("userJobs", {
      userId, uid, stage,
      ...flagsForStage(known.kind, applied_at, now),
      notes: args.notes ?? "",
      custom: {
        title,
        company: args.company?.trim() || undefined,
        location: args.location?.trim() || undefined,
        pay: args.pay?.trim() || undefined,
        url: args.url?.trim() || undefined,
        exp_min: args.exp_min ?? null,
        tags: args.tags?.trim() || undefined,
        via: args.via?.trim() || undefined,
        applied_at,
        created_at: now,
      },
    });
    await ctx.db.insert("stageEvents", { userId, uid, stage, ts: now });
    return uid;
  },
});

// Hand-entered rows have nothing behind them in the pool, so clearing the
// stage would leave an invisible orphan rather than returning a listing to
// the board. They get a real delete instead.
export const removeManual = mutation({
  args: { uid: v.string() },
  handler: async (ctx, { uid }) => {
    const userId = await requireUser(ctx);
    const row = await myRow(ctx, userId, uid);
    if (!row) return false;
    if (!row.custom) throw new Error("not a hand-entered listing");
    await ctx.db.delete(row._id);
    for (const e of await ctx.db.query("stageEvents")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).take(MAX_EVENTS)) {
      if (e.uid === uid) await ctx.db.delete(e._id);
    }
    return true;
  },
});

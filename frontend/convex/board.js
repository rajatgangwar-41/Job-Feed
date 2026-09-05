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

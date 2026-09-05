import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

// The board posts its whole ordered column list on any add/rename/reorder/
// delete, so this replaces the set rather than diffing it.
export const replace = mutation({
  args: {
    stages: v.array(v.object({
      id: v.string(),
      name: v.string(),
      kind: v.union(v.string(), v.null()),
      color: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, { stages }) => {
    const userId = await requireUser(ctx);
    if (!stages.length) throw new Error("a board needs at least one column");

    const old = await ctx.db.query("stages")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const [i, s] of stages.entries()) {
      await ctx.db.insert("stages", {
        userId, stageId: s.id, name: s.name, kind: s.kind,
        color: s.color || "#64748b", ord: i,
      });
    }

    // Deleting a column would otherwise strand its cards on a stage id that
    // no longer exists anywhere -- they leave the tracker instead.
    const ids = new Set(stages.map((s) => s.id));
    const mine = await ctx.db.query("userJobs")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).collect();
    for (const row of mine) {
      if (row.stage && !ids.has(row.stage)) {
        await ctx.db.patch(row._id, { stage: null, saved: 0, applied: 0, flagged: 0 });
      }
    }
    return true;
  },
});

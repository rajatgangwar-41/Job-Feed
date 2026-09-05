import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// One-off repair for rows written before ingest.push clamped both timestamps.
//
// Two things went wrong and both show up as a listing whose age the filter
// and the card disagree about:
//
//   * `when` was derived from the incoming first_seen while the stored
//     first_seen was clamped to the older of the two, so the field the age
//     filter reads drifted away from `posted_at ?? first_seen`, which is
//     what the card prints.
//   * `posted_at` was taken from each push as-is. A listing cannot be posted
//     after we first saw it, so posted_at > first_seen only ever means the
//     site relabelled a bumped listing -- Naukri does this constantly.
//
// Idempotent: it recomputes derived values from their own inputs, so running
// it twice changes nothing the second time. Batched because a mutation is a
// transaction with a document budget; `cursor` is the uid to resume after.
export const timestamps = internalMutation({
  args: { cursor: v.optional(v.string()), limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { cursor, limit = 500, dryRun = false }) => {
    const rows = await ctx.db.query("jobs")
      .withIndex("by_uid", (ix) => (cursor ? ix.gt("uid", cursor) : ix))
      .take(limit);

    let bumped = 0, resynced = 0;
    for (const r of rows) {
      const patch = {};
      let posted_at = r.posted_at ?? null;
      if (posted_at != null && posted_at > r.first_seen) {
        posted_at = r.first_seen;
        patch.posted_at = posted_at;
        bumped += 1;
      }
      const when = posted_at ?? r.first_seen;
      if (when !== r.when) {
        patch.when = when;
        resynced += 1;
      }
      if (!dryRun && Object.keys(patch).length) await ctx.db.patch(r._id, patch);
    }

    return {
      scanned: rows.length,
      bumpedPostedAt: bumped,
      resyncedWhen: resynced,
      next: rows.length === limit ? rows[rows.length - 1].uid : null,
    };
  },
});

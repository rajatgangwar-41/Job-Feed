import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { optionalUser, requireUser } from "./lib/auth";
import { DEFAULT_STAGES } from "./lib/stages";

// Loads less than ten minutes apart count as the same visit, so a reload
// does not wipe every "new" badge on the board. Mirrors the rule the old
// localStorage version used.
const SAME_VISIT_WINDOW = 600;

async function rowFor(ctx, userId) {
  return await ctx.db.query("users")
    .withIndex("by_user", (ix) => ix.eq("userId", userId)).unique();
}

// Kept separate from feed.get rather than folded into it: preferences change
// on a keystroke and the feed is the heaviest read in the app, so sharing one
// query would re-run the whole feed every time a filter moved.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await optionalUser(ctx);
    if (!userId) return null;
    const row = await rowFor(ctx, userId);
    if (!row) return { prefs: null, email: null, name: null };
    return { prefs: row.prefs ?? null, email: row.email ?? null, name: row.name ?? null };
  },
});

// Called once when the board mounts. Does the three things a first sign-in
// needs -- create the person's row, give them the default columns, and roll
// the visit window -- in one mutation, so it is one round trip rather than
// three, and cannot half-succeed.
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const userId = identity.subject;
    const now = Date.now() / 1000;

    const row = await rowFor(ctx, userId);
    // Identity comes off the verified token. Clerk's claim names differ by
    // JWT template, so fall back through the ones it actually sends.
    const email = identity.email ?? identity.emailAddress ?? undefined;
    const name = identity.name ?? identity.givenName ?? identity.nickname ?? undefined;

    let visitStart;
    if (!row) {
      // Nothing to compare a first-ever visit against, so badge nothing.
      visitStart = now;
      await ctx.db.insert("users", {
        userId, email, name, createdAt: now,
        lastLoadAt: now, visitStartAt: visitStart,
      });
    } else {
      const lastLoad = row.lastLoadAt ?? 0;
      visitStart = !lastLoad
        ? now
        : now - lastLoad > SAME_VISIT_WINDOW ? lastLoad : (row.visitStartAt ?? lastLoad);
      await ctx.db.patch(row._id, { email, name, lastLoadAt: now, visitStartAt: visitStart });
    }

    const hasStages = await ctx.db.query("stages")
      .withIndex("by_user", (ix) => ix.eq("userId", userId)).first();
    if (!hasStages) {
      for (const [i, st] of DEFAULT_STAGES.entries()) {
        await ctx.db.insert("stages", { userId, ...st, ord: i });
      }
    }

    return { visitStart };
  },
});

// The client debounces these, and sends the whole object -- prefs are read
// and written whole, so a field-level patch would buy nothing and would make
// removing a setting impossible.
export const savePrefs = mutation({
  args: { prefs: v.any() },
  handler: async (ctx, { prefs }) => {
    const userId = await requireUser(ctx);
    const now = Date.now() / 1000;
    const row = await rowFor(ctx, userId);
    if (row) await ctx.db.patch(row._id, { prefs });
    else await ctx.db.insert("users", { userId, prefs, createdAt: now, lastLoadAt: now, visitStartAt: now });
    return true;
  },
});

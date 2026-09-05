// Every query and mutation a signed-in person can reach goes through this.
// `identity.subject` is the Clerk user id, and it is the only thing that
// scopes a row to a person -- so a caller can never name someone else's
// userId, because they never supply it.
export async function requireUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in");
  return identity.subject;
}

// For queries that should render an empty board rather than throw while
// Clerk is still resolving on a fresh page load.
export async function optionalUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

// Admin is an allowlist of Clerk subjects held in the deployment's own
// environment -- `npx convex env set ADMIN_USER_IDS user_a,user_b` -- so it
// is never in the repo, never in the client bundle, and cannot be granted
// from the browser. Unset means nobody is admin: it fails closed, which is
// what you want if a deployment is ever restored without its env.
export async function requireAdmin(ctx) {
  const userId = await requireUser(ctx);
  if (!isAdminId(userId)) throw new Error("Not authorized");
  return userId;
}

export function isAdminId(userId) {
  const raw = process.env.ADMIN_USER_IDS || "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 && ids.includes(userId);
}

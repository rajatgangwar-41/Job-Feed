import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// The scraper cannot be a Convex function -- it drives a real Chrome through
// Playwright -- so it stays a local Python process and reaches the database
// through this one door.
//
// Auth here is a shared secret, not Clerk: the poller is a machine with no
// person behind it. Set a matching value on both sides:
//   npx convex env set POLLER_SECRET <value>      (Convex)
//   POLLER_SECRET=<value>                          (backend/.env)
//
// POLLER_SECRET holds a comma-separated LIST, so each machine that feeds this
// deployment can carry its own key rather than everyone sharing one. That
// matters the moment a second person runs the scraper: with a single value,
// removing one of them means rotating the secret for all of them, and every
// other scraper breaks until it is redistributed. With a list you delete that
// one entry and nobody else notices.
//
// A single value with no commas is still a valid list of one, which is what a
// solo setup has.
const http = httpRouter();

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401, headers: { "Content-Type": "application/json" },
  });
}

http.route({
  path: "/push",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const allowed = (process.env.POLLER_SECRET || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const offered = request.headers.get("x-poller-secret");
    // Both halves must fail closed: an unset variable leaves `allowed` empty,
    // and a caller sending no header at all offers null. Without the explicit
    // checks, an empty list plus a missing header could compare equal and let
    // an unconfigured deployment accept anything.
    if (!allowed.length || !offered || !allowed.includes(offered)) return unauthorized();

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runMutation(internal.ingest.push, {
      jobs: body.jobs ?? [],
      runs: body.runs ?? undefined,
      lastPoll: body.last_poll ?? undefined,
      running: body.running ?? undefined,
      pollMinutes: body.poll_minutes ?? undefined,
      filters: body.filters ?? undefined,
    });
    return new Response(JSON.stringify(result), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;

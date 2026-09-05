// All board reads and writes go through Convex now (see hooks/useFeed.js and
// hooks/useBoardActions.js). What is left here is the one thing Convex
// cannot do: ask the local Python scraper to run a poll right now.
//
// The scraper drives a real Chrome through Playwright, so it stays a process
// on your own machine. next.config.mjs rewrites /api/* to it, which means
// this only works while that backend is up -- the board itself does not
// need it, since listings arrive in Convex whenever the poller pushes them.
export async function postPoll() {
  try {
    const r = await fetch("/api/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok;
  } catch {
    return false;
  }
}

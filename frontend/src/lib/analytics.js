// Everything the Graph tab plots, derived in one place from the four things
// the feed gives us: the jobs, the ordered stage list, the ever-reached
// funnel counts, and the per-job stage history.
//
// Nothing here reads a stage by name. Stages are user data -- renamed,
// reordered, added, deleted -- so every metric is defined by *position* in
// the ordered list or by the two semantic kinds the backend does guarantee
// ("saved" and "rejected"). "Responded" therefore means "got past the first
// applied stage", not "reached a stage called Interview".

export const DAY = 86400;

// The first stage that counts as having applied: the backend marks anything
// that is not kind "saved" as applied, so that is the boundary.
function appliedIndex(stages) {
  return stages.findIndex((s) => s.kind !== "saved" && s.kind !== "rejected");
}

// Per job: how far it actually got, whether it died, and when it moved.
// `history` may be missing entries for jobs staged before it was recorded,
// so the current stage is always folded in as a floor.
export function jobPaths(allJobs, stages, history = {}) {
  const idxOf = new Map(stages.map((s, i) => [s.id, i]));
  const rejectedId = stages.find((s) => s.kind === "rejected")?.id;
  const appliedIdx = appliedIndex(stages);
  const paths = [];

  for (const j of allJobs) {
    const events = history[j.uid] || [];
    if (!j.stage && !events.length) continue;

    let furthest = -1, furthestId = null, appliedAt = null, movedAt = null;
    const seen = new Set();

    const consider = (id, ts) => {
      if (id === rejectedId || !idxOf.has(id)) return;
      const i = idxOf.get(id);
      seen.add(id);
      if (i > furthest) { furthest = i; furthestId = id; }
      if (ts == null) return;
      if (i === appliedIdx && (appliedAt == null || ts < appliedAt)) appliedAt = ts;
      if (i > appliedIdx && (movedAt == null || ts < movedAt)) movedAt = ts;
    };

    for (const [id, ts] of events) consider(id, ts);
    consider(j.stage, j.applied_at);
    if (appliedAt == null && j.applied_at) appliedAt = j.applied_at;

    paths.push({
      job: j,
      source: j.source,
      furthest, furthestId, seen,
      rejected: j.stage === rejectedId,
      applied: furthest >= appliedIdx && appliedIdx !== -1,
      appliedAt, movedAt,
      // only meaningful once both ends are known
      daysToMove: appliedAt != null && movedAt != null && movedAt > appliedAt
        ? (movedAt - appliedAt) / DAY : null,
    });
  }
  return paths;
}

// The funnel: how many jobs ever reached each stage, in column order, with
// the step-to-step conversion and how many sit there right now. `funnel`
// (server-side, from stage history) is authoritative; the client-side path
// count is the floor for anything it has not recorded.
export function funnelRows(paths, stages, funnel = {}) {
  const live = stages.filter((s) => s.kind !== "rejected");
  const reachedFromPaths = {};
  for (const p of paths) for (const id of p.seen) reachedFromPaths[id] = (reachedFromPaths[id] || 0) + 1;

  const hereNow = {};
  const diedAt = {};
  for (const p of paths) {
    if (p.job.stage) hereNow[p.job.stage] = (hereNow[p.job.stage] || 0) + 1;
    if (p.rejected && p.furthestId) diedAt[p.furthestId] = (diedAt[p.furthestId] || 0) + 1;
  }

  return live.map((s, i) => {
    const reached = Math.max(funnel[s.id] || 0, reachedFromPaths[s.id] || 0);
    const prev = i > 0 ? live[i - 1] : null;
    const prevReached = prev ? Math.max(funnel[prev.id] || 0, reachedFromPaths[prev.id] || 0) : null;
    return {
      stage: s,
      reached,
      hereNow: hereNow[s.id] || 0,
      diedHere: diedAt[s.id] || 0,
      conversion: prevReached ? Math.round((reached / prevReached) * 100) : null,
      prevName: prev?.name || null,
    };
  });
}

// Headline rates. Every one is a share of applications, so they read against
// a single denominator rather than each inventing their own.
export function rates(paths, stages, funnel = {}) {
  const appliedIdx = appliedIndex(stages);
  const live = stages.filter((s) => s.kind !== "rejected");
  const finalIdx = stages.indexOf(live[live.length - 1]);

  const applications = paths.filter((p) => p.applied);
  const n = applications.length;
  const responded = applications.filter((p) => p.furthest > appliedIdx);
  const won = applications.filter((p) => p.furthest >= finalIdx && finalIdx > appliedIdx);
  // "Ever rejected", like every other count in the funnel -- a card dragged
  // back out of Rejected does not un-happen. `lostNow` stays separate so the
  // funnel row can also say how many sit there today.
  const lostNow = applications.filter((p) => p.rejected).length;
  const rejectedId = stages.find((s) => s.kind === "rejected")?.id;
  const lostEver = Math.max(funnel[rejectedId] || 0, lostNow);

  const times = applications.map((p) => p.daysToMove).filter((d) => d != null).sort((a, b) => a - b);
  const median = times.length
    ? (times.length % 2 ? times[(times.length - 1) / 2]
      : (times[times.length / 2 - 1] + times[times.length / 2]) / 2)
    : null;

  const pct = (k) => (n ? Math.round((k / n) * 100) : null);
  return {
    applications: n,
    active: n - lostNow - won.length,
    responded: responded.length, respondedPct: pct(responded.length),
    won: won.length, wonPct: pct(won.length),
    lost: lostEver, lostPct: pct(lostEver), lostNow,
    medianDaysToMove: median,
    finalStageName: live[live.length - 1]?.name || null,
    appliedStageName: stages[appliedIdx]?.name || null,
  };
}

// Applications per day over a trailing window, oldest first. Always returns
// the full window (zeros included) so the columns keep an even rhythm and a
// quiet week reads as a gap rather than a missing bar.
export function appliedPerDay(paths, days = 21, now = Date.now() / 1000) {
  const start = new Date(now * 1000);
  start.setHours(0, 0, 0, 0);
  const startTs = start.getTime() / 1000 - (days - 1) * DAY;

  const buckets = Array.from({ length: days }, (_, i) => ({
    ts: startTs + i * DAY, count: 0,
  }));
  for (const p of paths) {
    if (!p.applied || p.appliedAt == null) continue;
    const i = Math.floor((p.appliedAt - startTs) / DAY);
    if (i >= 0 && i < days) buckets[i].count += 1;
  }
  return buckets;
}

// Applications per source, split by outcome. Sources past the eighth fold
// into "Other" rather than taking a ninth colour -- though outcome, not
// source, is what carries colour here.
export function bySource(paths, stages, limit = 8) {
  const appliedIdx = appliedIndex(stages);
  const live = stages.filter((s) => s.kind !== "rejected");
  const finalIdx = stages.indexOf(live[live.length - 1]);

  const map = new Map();
  for (const p of paths) {
    if (!p.applied) continue;
    const row = map.get(p.source) || { source: p.source, total: 0, won: 0, lost: 0, active: 0 };
    row.total += 1;
    if (p.rejected) row.lost += 1;
    else if (p.furthest >= finalIdx && finalIdx > appliedIdx) row.won += 1;
    else row.active += 1;
    map.set(p.source, row);
  }

  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit - 1);
  const tail = rows.slice(limit - 1).reduce((acc, r) => ({
    source: "other", total: acc.total + r.total, won: acc.won + r.won,
    lost: acc.lost + r.lost, active: acc.active + r.active,
  }), { source: "other", total: 0, won: 0, lost: 0, active: 0 });
  return [...head, tail];
}

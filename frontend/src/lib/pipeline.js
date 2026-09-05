// Mirrors backend Store.set_stage()'s boolean-sync rules so an optimistic
// drag-and-drop update looks identical to what the server will confirm:
// any column at all means saved, any column past "saved" means applied,
// and "rejected" is just the tracker's name for not-interested.
export function deriveFlagsForStage(job, stageId, stages) {
  if (!stageId) return { stage: null, saved: 0, applied: 0, flagged: 0 };
  const kind = stages.find((s) => s.id === stageId)?.kind || null;
  if (kind === "rejected") return { stage: stageId, saved: 1, flagged: 1 };
  if (kind === "saved") return { stage: stageId, saved: 1, flagged: 0 };
  return { stage: stageId, saved: 1, applied: 1, flagged: 0, applied_at: job.applied_at || Date.now() / 1000 };
}

// A short, stable palette to offer (or fall back to) for a freshly-added
// column -- cycles rather than repeating the seeded defaults so a new
// column doesn't visually collide with "Applied" or "Rejected".
export const STAGE_COLORS = [
  "#2563eb", "#7c3aed", "#0891b2", "#4f46e5", "#0d9488",
  "#c026d3", "#ca8a04", "#16a34a", "#e11d48", "#4338ca",
];

export function nextStageColor(stages) {
  return STAGE_COLORS[stages.length % STAGE_COLORS.length];
}

export function slugifyStageId(name, existingIds) {
  const base = (name || "stage").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "stage";
  let id = base, i = 2;
  while (existingIds.includes(id)) id = `${base}-${i++}`;
  return id;
}

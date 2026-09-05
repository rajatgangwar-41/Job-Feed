// Kept in step with DEFAULT_STAGES in backend/store.py. Interview Round 2 is
// fuchsia rather than a second indigo: the two indigos measured Delta E 5.6
// apart, indistinguishable even with full colour vision.
export const DEFAULT_STAGES = [
  { stageId: "saved", name: "Saved", kind: "saved", color: "#d97706" },
  { stageId: "applied", name: "Applied", kind: null, color: "#2563eb" },
  { stageId: "shortlisted", name: "Shortlisted", kind: null, color: "#7c3aed" },
  { stageId: "oa", name: "OA", kind: null, color: "#0891b2" },
  { stageId: "interview-1", name: "Interview Round 1", kind: null, color: "#4f46e5" },
  { stageId: "interview-2", name: "Interview Round 2", kind: null, color: "#c026d3" },
  { stageId: "hr", name: "HR Round", kind: null, color: "#0d9488" },
  { stageId: "selected", name: "Selected", kind: null, color: "#16a34a" },
  { stageId: "rejected", name: "Rejected", kind: "rejected", color: "#dc2626" },
];

// Mirrors Store.set_stage()'s boolean sync: any column at all means saved,
// any column that is not "saved" means applied, and "rejected" is the
// tracker's name for not-interested.
export function flagsForStage(kind, existingAppliedAt, now) {
  if (kind === "rejected") return { saved: 1, applied: 0, flagged: 1 };
  if (kind === "saved") return { saved: 1, applied: 0, flagged: 0 };
  return { saved: 1, applied: 1, flagged: 0, applied_at: existingAppliedAt ?? now };
}

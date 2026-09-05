"use client";
import { useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { deriveFlagsForStage } from "@/lib/pipeline";

// Every write the board can make, each carrying its own optimistic update so
// the UI moves on the same frame as the click.
//
// This replaces hand-rolled optimism: the old code patched local state, sent
// a POST, and on failure wrote the previous value back by hand. Convex keeps
// the optimistic patch in a separate layer over the query result and drops
// it when the mutation resolves -- so a failed write rolls back on its own,
// and a concurrent change from elsewhere is not clobbered by a stale revert.
export function useBoardActions(feedArgs) {
  const patch = useMemo(() => (store, fn) => {
    const cur = store.getQuery(api.feed.get, feedArgs);
    if (!cur) return null;
    const next = fn(cur);
    store.setQuery(api.feed.get, feedArgs, next);
    return next;
  }, [feedArgs]);

  const mark = useMutation(api.board.mark).withOptimisticUpdate((store, { uid, field, value }) =>
    patch(store, (cur) => ({
      ...cur,
      jobs: cur.jobs.map((j) => (j.uid !== uid ? j : {
        ...j,
        [field]: value ? 1 : 0,
        ...(field === "applied" ? { applied_at: value ? Date.now() / 1000 : null } : {}),
      })),
    })));

  const setNote = useMutation(api.board.setNote).withOptimisticUpdate((store, { uid, text }) =>
    patch(store, (cur) => ({
      ...cur,
      jobs: cur.jobs.map((j) => (j.uid === uid ? { ...j, notes: text } : j)),
    })));

  // deriveFlagsForStage mirrors the same rules the mutation applies server
  // side, so the optimistic card looks exactly like the confirmed one.
  const setStage = useMutation(api.board.setStage).withOptimisticUpdate((store, { uid, stage }) =>
    patch(store, (cur) => ({
      ...cur,
      jobs: cur.jobs.map((j) => (j.uid === uid ? { ...j, ...deriveFlagsForStage(j, stage, cur.stages) } : j)),
    })));

  const setStages = useMutation(api.stages.replace).withOptimisticUpdate((store, { stages }) =>
    patch(store, (cur) => ({
      ...cur,
      stages,
      // A deleted column takes its cards off the board, which is what the
      // mutation does too -- without this the cards would hang on a stage id
      // that no longer has a column until the server answered.
      jobs: cur.jobs.map((j) => (
        j.stage && !stages.some((s) => s.id === j.stage)
          ? { ...j, stage: null, saved: 0, applied: 0, flagged: 0 }
          : j
      )),
    })));

  // No optimistic update: the server mints the uid, so there is nothing to
  // insert locally that would survive the real result arriving. The feed is a
  // live subscription, so the row shows up on its own a moment later.
  const addManual = useMutation(api.board.addManual);
  const removeManual = useMutation(api.board.removeManual);

  return { mark, setNote, setStage, setStages, addManual, removeManual };
}

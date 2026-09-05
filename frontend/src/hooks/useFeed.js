"use client";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useCoarseNow } from "./useCoarseNow";

// The feed used to be an HTTP endpoint polled every 60s, with an abort
// controller so a fast series of filter changes could not land out of order.
// It is now a single Convex subscription: the server pushes a new result
// when anything it read changes, so the interval, the visibility listener
// and the race guard are all gone -- and a mark made in another tab shows
// up here without waiting for the next tick.
const num = (v) => (v == null || v === "any" || v === "" ? null : Number(v));

export function useFeed(age, exp) {
  // Handed to the query rather than read inside it -- see useCoarseNow.
  const now = useCoarseNow(60);
  // Memoised because these exact args identify the query in Convex's local
  // store -- the optimistic updates in useBoardActions have to address the
  // same key, and a fresh object each render would miss it.
  const args = useMemo(() => ({ maxAgeDays: num(age), maxExpYears: num(exp), now }), [age, exp, now]);
  const data = useQuery(api.feed.get, args);
  return { data: data ?? null, args, loading: data === undefined };
}

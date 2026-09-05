"use client";
import { useEffect, useMemo, useState } from "react";
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
  // Five minutes, not one: every distinct value is a new query key, and all
  // that hangs off it is a day-granularity age cutoff and the 24h/7d applied
  // counts. A minute bought nothing and cost a subscription swap sixty times
  // an hour.
  const now = useCoarseNow(300);
  // Memoised because these exact args identify the query in Convex's local
  // store -- the optimistic updates in useBoardActions have to address the
  // same key, and a fresh object each render would miss it.
  const args = useMemo(() => ({ maxAgeDays: num(age), maxExpYears: num(exp), now }), [age, exp, now]);
  const data = useQuery(api.feed.get, args);

  // Convex answers `undefined` while a query with new arguments loads, and
  // advancing the clock changes the arguments -- so the board dropped to its
  // skeleton on a timer, with no poll and no filter change behind it.
  //
  // Held per filter pair, not globally. Across a clock tick the incoming
  // result is the same board a few minutes on, so showing the previous one
  // meanwhile is honest. Across a filter change it would be a different
  // board, and showing the old rows under the new filter would be a lie --
  // hence the key, which makes that case fall through to the skeleton.
  // State rather than a ref: a ref read during render is exactly the thing
  // that can go stale without re-rendering, and the lint rule that forbids it
  // is right to.
  const key = `${args.maxAgeDays}|${args.maxExpYears}`;
  const [held, setHeld] = useState({ key: null, data: null });
  useEffect(() => {
    if (data !== undefined) setHeld({ key, data });
  }, [data, key]);
  const value = data === undefined && held.key === key ? held.data : data;

  return { data: value ?? null, args, loading: value == null };
}

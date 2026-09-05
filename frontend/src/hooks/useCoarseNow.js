"use client";
import { useEffect, useState } from "react";

// The clock, as a value a Convex query can take as an argument.
//
// A query is not rerun because time advanced, so reading the clock inside
// one freezes whatever it derived: an age cutoff stops moving, a "last 24h"
// counter stays stuck at the moment the query last happened to run. Passing
// the time in fixes that -- but the time has to be *coarse*, or every
// distinct millisecond becomes a new query key and the server-side cache
// never gets a hit.
//
// Rounded down to `stepSeconds`, and polled at a fraction of that so the
// value lands promptly after each boundary rather than up to a full step
// late. It is read with a lazy `useState` initialiser rather than during
// render, because `Date.now()` is impure and a render must not depend on it.
export function useCoarseNow(stepSeconds = 60) {
  const floor = () => Math.floor(Date.now() / 1000 / stepSeconds) * stepSeconds;
  const [now, setNow] = useState(floor);

  useEffect(() => {
    const tick = () => setNow((prev) => {
      const next = Math.floor(Date.now() / 1000 / stepSeconds) * stepSeconds;
      // Returning the identical value is a no-op re-render for React, so a
      // tick inside the same bucket costs nothing.
      return next === prev ? prev : next;
    });
    const id = setInterval(tick, Math.max(1000, (stepSeconds / 4) * 1000));
    return () => clearInterval(id);
  }, [stepSeconds]);

  return now;
}

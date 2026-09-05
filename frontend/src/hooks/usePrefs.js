"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useDebouncedCallback } from "use-debounce";
import { api } from "@convex/_generated/api";
import { DEFAULT_PREFS, DEFAULT_FILTERS, PREFS_KEY } from "@/lib/constants";

// Every view/filter/layout choice lives in one object, and that object now
// lives in the database -- so your presets, hidden companies and filters
// follow you to another browser instead of being stranded in the one that
// happened to set them.
//
// localStorage stays, demoted to a cache. It is read before the network
// answers so the first paint already has the right theme and view (the
// pre-paint script in layout.js reads the same key), and it is written on
// every change so a cold start never flashes the wrong theme. The database
// is authoritative: whatever it holds wins once it arrives.
const SAVE_DEBOUNCE = 700;

function normalise(saved) {
  if (!saved) return null;
  const out = { ...DEFAULT_PREFS, ...saved, filters: { ...DEFAULT_FILTERS, ...(saved.filters || {}) } };
  // "list" was a real view before it was removed; a returning visitor with
  // it saved would otherwise land on a view that no longer exists.
  if (out.view === "list") out.view = "board";
  return out;
}

export function usePrefs() {
  const remote = useQuery(api.users.get);
  const savePrefs = useMutation(api.users.savePrefs);

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const adopted = useRef(false);
  const lastSaved = useRef(null);
  const prefsRef = useRef(DEFAULT_PREFS);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // 1. The cache, for a first paint that already looks right. `hydrated`
  //    flips here rather than after the network, because the theme should
  //    not wait on a round trip.
  useEffect(() => {
    try {
      const cached = normalise(JSON.parse(localStorage.getItem(PREFS_KEY) || "null"));
      if (cached) setPrefs(cached);
    } catch { /* private mode, or a corrupt value -- defaults are fine */ }
    setHydrated(true);
  }, []);

  const push = useDebouncedCallback((next) => {
    const json = JSON.stringify(next);
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    // On failure, forget what we thought was saved so the next change
    // retries rather than being skipped as a no-op.
    savePrefs({ prefs: next }).catch(() => { lastSaved.current = null; });
  }, SAVE_DEBOUNCE);

  // 2. Then the database, exactly once. Adopting on every change would
  //    fight the person currently typing in a filter box.
  useEffect(() => {
    if (remote === undefined || adopted.current) return;
    adopted.current = true;
    const saved = normalise(remote?.prefs);
    if (saved) {
      // Marked as already-saved so adopting does not bounce straight back.
      lastSaved.current = JSON.stringify(saved);
      setPrefs(saved);
    } else {
      // No row yet: whatever this browser had becomes the account's prefs,
      // so moving to the database does not throw away existing settings.
      push(prefsRef.current);
    }
  }, [remote, push]);

  // 3. Write through on every change: the cache immediately, the database
  //    debounced -- the search box updates prefs on each keystroke, and
  //    that must not be one mutation per character.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    if (adopted.current) push(prefs);
  }, [prefs, hydrated, push]);

  const update = useCallback((patch) => {
    setPrefs((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  }, []);

  const updateFilters = useCallback((patch) => {
    setPrefs((p) => ({ ...p, filters: { ...p.filters, ...(typeof patch === "function" ? patch(p.filters) : patch) } }));
  }, []);

  return { prefs, hydrated, update, updateFilters };
}

// Creates the account's row, seeds its columns and rolls the visit window,
// in one call on mount. It returns the visit boundary the "new" badges
// compare against: previously two localStorage keys, so "last visit" meant
// "last visit in this browser" -- now it means the last time you opened the
// board anywhere.
//
// Infinity until the server answers, so nothing is badged new on the strength
// of a guess.
export function useBootstrap() {
  const ensure = useMutation(api.users.ensure);
  const [visitStart, setVisitStart] = useState(Infinity);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    ensure()
      .then((r) => { if (r?.visitStart != null) setVisitStart(r.visitStart); })
      .catch(() => { /* board still works; nothing gets a "new" badge */ });
  }, [ensure]);

  return visitStart;
}

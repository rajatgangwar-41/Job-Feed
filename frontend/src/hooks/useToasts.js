"use client";
import { useState, useCallback, useRef } from "react";

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback((msg, undo) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, msg, undo }]);
    timers.current[id] = setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return { toasts, toast, dismiss };
}

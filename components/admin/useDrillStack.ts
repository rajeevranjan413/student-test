"use client";

import { useCallback, useState } from "react";

/**
 * A tiny in-component navigation stack for the batch-first admin drill-downs (D29):
 * Tests, Homework (batch grid → items) and Study Material (batch grid → subjects →
 * notes). The current view is the top of the stack; `push` descends a level, `back`
 * climbs one, and `jumpTo` collapses to an absolute depth (breadcrumb jumps).
 *
 * State is kept in-component (not in the URL): `useSearchParams` would force a
 * Suspense boundary in these `"use client"` pages, and touching `history.state`
 * risks clobbering the Next App Router's own routing state. In-page breadcrumb / back
 * affordances are the "up" navigation; opening a detail *route* (`router.push`) is a
 * normal navigation and the page remounts at the root level on return.
 */
export function useDrillStack<T>(root: T) {
  const [stack, setStack] = useState<T[]>([root]);

  const push = useCallback((view: T) => {
    setStack((s) => [...s, view]);
  }, []);

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // Jump to an absolute depth in the stack (0 = root). No-op if out of range.
  const jumpTo = useCallback((index: number) => {
    setStack((s) => (index >= 0 && index < s.length - 1 ? s.slice(0, index + 1) : s));
  }, []);

  const current = stack[stack.length - 1];
  return { stack, current, depth: stack.length - 1, push, back, jumpTo };
}

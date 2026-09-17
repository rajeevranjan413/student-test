"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Holds the signed-in student's enrolled batches and their currently-selected
 * "active" batch, so the header batch switcher (AppBar) and the student
 * dashboard stay in sync. A `null` active batch means "All batches".
 *
 * The selection is persisted to localStorage so it survives navigation and
 * reloads. Batches are fetched lazily — only while on a `/student` route — so
 * teachers and public pages pay nothing. See docs/FEATURES.md → F1 / D23.
 */

export type StudentBatch = {
  id: string;
  name: string | null;
  start_time: string | null;
  end_time: string | null;
};

type BatchContextValue = {
  batches: StudentBatch[];
  activeBatchId: string | null;
  setActiveBatchId: (id: string | null) => void;
  loading: boolean;
};

const BatchContext = React.createContext<BatchContextValue | null>(null);

const STORAGE_KEY = "nc.activeBatchId";

export function BatchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isStudent = pathname.startsWith("/student");

  const [batches, setBatches] = React.useState<StudentBatch[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Read the persisted selection synchronously on the client so we never briefly
  // flash "All batches" before restoring it. Returns null during SSR.
  const [activeBatchId, setActive] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setActiveBatchId = React.useCallback((id: string | null) => {
    setActive(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) — selection just won't persist */
    }
  }, []);

  React.useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/student/batches");
        if (!res.ok) return;
        const data: StudentBatch[] = await res.json();
        if (cancelled) return;
        setBatches(data);
        // Reconcile a stale selection: if the saved active batch is no longer one
        // the student is enrolled in (e.g. a teacher removed them), fall back to
        // "All batches" rather than filtering to an empty view.
        setActive((cur) =>
          cur && data.some((b) => b.id === cur) ? cur : null
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStudent]);

  const value = React.useMemo(
    () => ({ batches, activeBatchId, setActiveBatchId, loading }),
    [batches, activeBatchId, setActiveBatchId, loading]
  );

  return <BatchContext.Provider value={value}>{children}</BatchContext.Provider>;
}

/** Access the batch switcher state. Safe to call outside the provider (returns a
 *  no-op default), so components don't need to guard for it. */
export function useBatches(): BatchContextValue {
  return (
    React.useContext(BatchContext) ?? {
      batches: [],
      activeBatchId: null,
      setActiveBatchId: () => {},
      loading: false,
    }
  );
}

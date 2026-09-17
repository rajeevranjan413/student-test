// Batch "class timing" helpers. Postgres `TIME` columns come back as strings like
// "18:00:00" (or "18:00"); the create/edit forms send "HH:MM" from <input type="time">.

function formatTime(value?: string | null): string | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return null;
  const m = Number(mStr ?? "0");
  const minutes = Number.isNaN(m) ? 0 : m;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Human-readable class timing, e.g. "6:00 AM – 8:00 AM". Null-safe: returns null when
 * neither bound is set (legacy batches), or a single bound if only one exists.
 */
export function formatBatchTiming(
  start?: string | null,
  end?: string | null
): string | null {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? null;
}

/** Trim a `TIME` value to the "HH:MM" that <input type="time"> expects. */
export function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  if (h == null || m == null) return "";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

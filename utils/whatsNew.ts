// "What's new" for students (FEATURES F16). A tiny client-side layer that lets a
// student see, at a glance, what the teacher has ADDED or CHANGED since they last
// looked — an alert count on the home section cards and a New / Updated tag on the
// individual list cards.
//
// How it works (no per-student server state): each item carries an activity
// **signature** = greatest(created_at, updated_at) (+ note count for a subject
// folder). The browser remembers, per section, the signature it last saw for every
// item (localStorage). An item is:
//   - "new"      → its id was never seen before,
//   - "updated"  → its id was seen but the signature changed (teacher edited it / a
//                  note was added to the folder),
//   - "seen"     → signature unchanged.
// The unseen count (new + updated) badges the home card; opening the section marks
// its items seen so the badge clears. Pure + SSR-safe (guards `window`), so it is
// imported by both the Route Handler (to build signatures) and the antd pages.

/** The three student sections that surface "what's new". */
export type WhatsNewSection = "tests" | "homework" | "study";

export const WHATS_NEW_SECTIONS: WhatsNewSection[] = ["tests", "homework", "study"];

/** An item reduced to just what the badge/tag logic needs. */
export type NewItem = { id: string; sig: string };

/** Per-item status relative to what the student has already seen. */
export type SeenStatus = "new" | "updated" | "seen";

/**
 * Activity signature for a test/homework row: the later of created_at / updated_at.
 * Falls back gracefully if updated_at is absent (pre-migration rows). Same function
 * runs server-side (whats-new endpoint) and client-side (list pages) so the two
 * always agree.
 */
export function itemSignature(row: {
  created_at?: string | null;
  updated_at?: string | null;
}): string {
  const created = row.created_at ? Date.parse(row.created_at) : 0;
  const updated = row.updated_at ? Date.parse(row.updated_at) : 0;
  return String(Math.max(created || 0, updated || 0));
}

/**
 * Activity signature for a study-material subject **folder**. Combines the folder's
 * latest note activity with its note count, so adding a note (which bumps both) marks
 * the folder "updated" even if two notes happen to share a timestamp.
 */
export function subjectSignature(activityAt: string | null, noteCount: number): string {
  const ts = activityAt ? Date.parse(activityAt) : 0;
  return `${ts || 0}:${noteCount}`;
}

const STORAGE_PREFIX = "ncc:whatsnew:";

function storageKey(section: WhatsNewSection): string {
  return `${STORAGE_PREFIX}${section}`;
}

/** Read the seen registry (id → last-seen signature) for a section. */
function readSeen(section: WhatsNewSection): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(section));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Status of one item against the section's seen registry. */
export function statusFor(
  seen: Record<string, string>,
  item: NewItem
): SeenStatus {
  if (!(item.id in seen)) return "new";
  if (seen[item.id] !== item.sig) return "updated";
  return "seen";
}

/**
 * Snapshot each item's status against what's currently stored — WITHOUT mutating the
 * registry. Call this on load to decide which cards get a New/Updated tag; then call
 * `markSeen` so the next visit is clean.
 */
export function snapshotStatus(
  section: WhatsNewSection,
  items: NewItem[]
): { statusById: Record<string, SeenStatus>; unseen: number } {
  const seen = readSeen(section);
  const statusById: Record<string, SeenStatus> = {};
  let unseen = 0;
  for (const it of items) {
    const s = statusFor(seen, it);
    statusById[it.id] = s;
    if (s !== "seen") unseen += 1;
  }
  return { statusById, unseen };
}

/** How many of `items` are unseen (new or updated) — powers the home card badge. */
export function countUnseen(section: WhatsNewSection, items: NewItem[]): number {
  const seen = readSeen(section);
  let n = 0;
  for (const it of items) if (statusFor(seen, it) !== "seen") n += 1;
  return n;
}

/**
 * Record the current signatures as seen. **Merges** into the existing registry (does
 * not rebuild it) so marking a batch-filtered list seen never drops another batch's
 * seen state. The registry only ever grows by the ids a student actually views;
 * that's a handful of keys, so unbounded growth isn't a practical concern.
 */
export function markSeen(section: WhatsNewSection, items: NewItem[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    const next = readSeen(section);
    for (const it of items) next[it.id] = it.sig;
    window.localStorage.setItem(storageKey(section), JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / quota) — badges simply won't persist.
  }
}

// Shared constants + types for Study Material (F13). Kept framework-agnostic so
// both the Route Handlers and the antd pages import from one place.

/** The storage bucket that holds the PDF bytes (private; see migration + D24). */
export const STUDY_BUCKET = "study-material";

/** Max upload size — 25 MB. PDFs of notes are comfortably under this. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Accepted content type. Only PDFs today (the `notes` kind). */
export const ACCEPTED_MIME = "application/pdf";

/** Material kinds. Only `notes` today; free-form on the wire for future kinds. */
export type StudyMaterialKind = "notes";

/** A study-material row as returned by the list APIs (no storage internals). */
export type StudyMaterial = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  kind: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

/** Human-readable file size, e.g. "1.4 MB". Null-safe for the UI. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

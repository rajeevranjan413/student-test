// Shared constants + types for Study Material (F13). Kept framework-agnostic so
// both the Route Handlers and the antd pages import from one place.

/** The storage bucket that holds the note bytes (private; see migration + D24). */
export const STUDY_BUCKET = "study-material";

/** Max upload size — 25 MB. Notes (PDFs / images) are comfortably under this. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Accepted content types for a note file: PDF or a common raster image (D25).
 * SVG is deliberately excluded — it can carry script and would open inline.
 */
export const ACCEPTED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AcceptedMime = (typeof ACCEPTED_MIMES)[number];

/** The `accept` attribute for the antd Upload / file input. */
export const ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*";

/** File extension to store per accepted mime (used to build the object path). */
const EXT_BY_MIME: Record<AcceptedMime, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Is this an accepted note file? Falls back to the filename extension. */
export function isAcceptedFile(mime: string, fileName: string): boolean {
  if ((ACCEPTED_MIMES as readonly string[]).includes(mime)) return true;
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(fileName);
}

/** Whether a note's mime is an image (vs. a PDF) — drives the icon/preview. */
export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

/** The storage extension for an upload, from its mime then its filename. */
export function extForUpload(mime: string, fileName: string): string {
  if (mime in EXT_BY_MIME) return EXT_BY_MIME[mime as AcceptedMime];
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  return m ? m[1].toLowerCase() : "bin";
}

/** A subject folder as returned by the subject list APIs. */
export type Subject = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  name: string;
  note_count: number;
  created_at: string;
};

/** A study-material (note) row as returned by the list APIs (no storage internals). */
export type StudyMaterial = {
  id: string;
  subject_id: string | null;
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

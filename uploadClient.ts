// Client helper: direct browser → R2 uploads (D35). Two phases:
//   1. ask the server for presigned PUT URLs (`POST /api/uploads/sign`);
//   2. PUT each file's bytes STRAIGHT to R2 (never through the app server), reporting
//      progress; then hand the resulting object keys back to the finalize endpoint
//      (`POST /api/study-materials` | `/api/homework`) which records the DB rows.
//
// Used by the admin Study-Material + Homework upload screens so files up to 2 GB upload
// without the app server ever buffering them.

export type UploadScope = "study-material" | "homework" | "banner";

/** Where the files belong — a subject (study material) or a batch (homework). */
export type UploadTarget = { subjectId?: string; batchId?: string };

/** The metadata the finalize endpoints expect per uploaded file. */
export type UploadedFile = { key: string; name: string; size: number; type: string };

type SignedUpload = { url: string; key: string; contentType: string };

/** PUT one file's bytes to a presigned R2 URL, reporting 0..1 progress. */
function putToR2(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network or CORS error."));
    xhr.send(file);
  });
}

/**
 * Sign + upload every file directly to R2. `onProgress` reports overall 0..1 across all
 * files (weighted by byte size). Returns the finalize metadata (object keys) in order.
 * Throws on the first failure — the caller aborts and shows the message.
 */
export async function uploadFilesDirect(
  scope: UploadScope,
  target: UploadTarget,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<UploadedFile[]> {
  // Phase 1 — presigned PUT URLs.
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      subjectId: target.subjectId,
      batchId: target.batchId,
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not prepare the upload.");
  const uploads: SignedUpload[] = data.uploads ?? [];
  if (uploads.length !== files.length)
    throw new Error("Upload could not be prepared for every file.");

  // Phase 2 — PUT each file straight to R2, tracking byte-weighted overall progress.
  const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
  const done = new Array(files.length).fill(0);
  const report = () => {
    if (!onProgress) return;
    const loaded = done.reduce((s, n) => s + n, 0);
    onProgress(Math.min(1, loaded / totalBytes));
  };

  const result: UploadedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const up = uploads[i];
    await putToR2(up.url, file, up.contentType, (frac) => {
      done[i] = frac * file.size;
      report();
    });
    done[i] = file.size;
    report();
    result.push({ key: up.key, name: file.name, size: file.size, type: up.contentType });
  }
  return result;
}

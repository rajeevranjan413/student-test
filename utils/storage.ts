// Private file storage on Cloudflare R2 — SERVER ONLY (DECISIONS D34, supersedes D27).
//
// The app stores file bytes (Study Material notes F13, `file`-kind Homework F14) in a
// PRIVATE store and hands the browser short-lived, authorized URLs — never a public
// link. Bytes live in a single **Cloudflare R2** bucket (S3-compatible). R2 buckets are
// private by default: a raw object URL is not reachable, so the app mints a short-lived
// **presigned** GET URL per request, mirroring the old Supabase private-bucket model.
//
// Every file row still records its own `storage_provider` (now always `r2` for new
// uploads); the value is retained so the per-row dispatch structure stays intact and any
// legacy row is detectable. Import this only from Route Handlers (or their server-only
// helpers) — it reads the R2 secret access key from env.
//
// Layout: ONE R2 bucket (`R2_BUCKET`). The logical "bucket" passed by the features
// ("study-material" / "homework") is used as the object-key PREFIX, so `file_path` is a
// self-contained R2 object key like `study-material/<batch>/<subject>/<uuid>.pdf`.

import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageProvider = "r2";

/** How long a minted read (GET) URL is valid, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 60;

/**
 * How long a presigned upload (PUT) URL is valid, in seconds. Generous because a large
 * (up to 2 GB) direct-to-R2 upload can take a while; the signature is checked when the
 * request STARTS, so a long-running PUT that began before expiry still completes.
 */
export const PUT_URL_TTL_SECONDS = 60 * 60;

/** A stored file reference persisted on the row (`storage_provider` + `file_path`). */
export type StoredFile = { provider: StorageProvider; path: string };

/** The provider NEW uploads go to. R2 is the only backend (D34). */
export function activeUploadProvider(): StorageProvider {
  return "r2";
}

/** True when the R2 credentials + bucket are present. */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

let _client: S3Client | null = null;
function r2(): S3Client {
  if (!isR2Configured())
    throw new Error(
      "Cloudflare R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET."
    );
  if (!_client) {
    // R2's S3 endpoint. `region: "auto"` is what R2 expects; the account-id host routes
    // to your bucket. An explicit R2_ENDPOINT overrides (e.g. a jurisdiction-specific host).
    const endpoint =
      process.env.R2_ENDPOINT?.trim() ||
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    _client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return _client;
}

function bucketName(): string {
  return process.env.R2_BUCKET as string;
}

export type UploadInput = {
  /** Logical bucket / key prefix root (e.g. "study-material", "homework"). */
  bucket: string;
  /** Path segment under the prefix, no leading/trailing slash (e.g. `<batch>/<subject>`). */
  keyPrefix: string;
  /** File extension without a dot (e.g. "pdf", "png"). */
  ext: string;
  /** The file's MIME type (stored on the R2 object; returned on view). */
  contentType: string;
  /** The raw bytes. */
  bytes: Buffer;
  /** Override the target provider; defaults to `activeUploadProvider()`. */
  provider?: StorageProvider;
};

/**
 * Upload bytes to the private R2 bucket. Returns the `StoredFile` to persist on the row
 * (its `path` is the full R2 object key). Throws on failure (the caller rolls back the DB row).
 */
export async function uploadObject(input: UploadInput): Promise<StoredFile> {
  // Key includes the logical bucket as a prefix, so `file_path` is self-contained.
  const key = `${input.bucket}/${input.keyPrefix}/${randomUUID()}.${input.ext}`.replace(
    /\/+/g,
    "/"
  );
  await r2().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
    })
  );
  return { provider: "r2", path: key };
}

/** Build a fresh object key: `<bucket>/<keyPrefix>/<uuid>.<ext>` (slash-collapsed). */
function newKey(bucket: string, keyPrefix: string, ext: string): string {
  return `${bucket}/${keyPrefix}/${randomUUID()}.${ext}`.replace(/\/+/g, "/");
}

export type PresignPutInput = {
  /** Logical bucket / key prefix root (e.g. "study-material", "homework"). */
  bucket: string;
  /** Path segment under the prefix (e.g. `<batch>/<subject>` or `<batch>`). */
  keyPrefix: string;
  /** File extension without a dot. */
  ext: string;
  /** The MIME type the browser will send — signed, so the PUT must send it verbatim. */
  contentType: string;
};

/**
 * Mint a short-lived presigned **PUT** URL so the browser can upload bytes DIRECTLY to
 * the private R2 bucket (never through the app server) — required for large (up to 2 GB)
 * files. Returns the URL plus the `StoredFile` (its key) to persist once the client
 * confirms the upload. The client MUST send `Content-Type: <contentType>` on the PUT to
 * match the signature (D35).
 */
export async function presignPutUrl(
  input: PresignPutInput
): Promise<{ url: string; file: StoredFile; contentType: string }> {
  const key = newKey(input.bucket, input.keyPrefix, input.ext);
  const url = await getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: input.contentType }),
    { expiresIn: PUT_URL_TTL_SECONDS }
  );
  return { url, file: { provider: "r2", path: key }, contentType: input.contentType };
}

/**
 * Server-side copy of an already-uploaded object to a NEW key under `dest` (same R2
 * bucket). Used by the multi-batch fan-out (D33) so a file uploaded once by the browser
 * is duplicated per target WITHOUT the bytes passing through the app server. Returns the
 * new `StoredFile`.
 */
export async function copyObject(
  from: StoredFile,
  dest: { bucket: string; keyPrefix: string; ext: string }
): Promise<StoredFile> {
  const key = newKey(dest.bucket, dest.keyPrefix, dest.ext);
  // CopySource is `<bucket>/<key>`, URL-encoded but with the slashes preserved.
  const copySource = `${bucketName()}/${from.path}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  await r2().send(
    new CopyObjectCommand({ Bucket: bucketName(), CopySource: copySource, Key: key })
  );
  return { provider: "r2", path: key };
}

/**
 * HEAD an object to confirm it exists and read its authoritative size / content type.
 * Returns `null` if it doesn't exist (or on any error) — used at finalize to verify the
 * browser actually uploaded the bytes for a key it claims, and to trust the real size
 * over a client-reported one. Only R2-backed files are supported.
 */
export async function headObject(
  file: StoredFile
): Promise<{ size: number; contentType?: string } | null> {
  if (file.provider !== "r2") return null;
  try {
    const r = await r2().send(
      new HeadObjectCommand({ Bucket: bucketName(), Key: file.path })
    );
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch {
    return null;
  }
}

export type SignOptions = {
  /** Logical bucket — accepted for call-site compatibility; R2 uses the single R2_BUCKET. */
  bucket: string;
  /** `download` forces an attachment with `fileName`; `view` opens inline. */
  mode: "view" | "download";
  /** Original filename, preserved on download. */
  fileName: string;
  /** Optional content type to advertise on inline view. */
  contentType?: string;
};

/**
 * Mint a short-lived, authorized (presigned) GET URL to a stored file. The caller MUST
 * have already authorized the request. `download` forces an attachment (original name);
 * `view` opens inline. The presigned URL is unguessable and expires in ~60s.
 */
export async function signedUrl(file: StoredFile, opts: SignOptions): Promise<string> {
  if (file.provider !== "r2")
    throw new Error(`Unsupported storage provider "${file.provider}" (only R2 is configured).`);

  const disposition =
    opts.mode === "download"
      ? `attachment; filename="${encodeURIComponent(opts.fileName)}"`
      : "inline";

  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: file.path,
      ResponseContentDisposition: disposition,
      ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

/**
 * Best-effort delete of stored objects. Never throws — deletion is a cleanup step and a
 * missing object shouldn't fail the request. The `bucket` arg is accepted for call-site
 * compatibility; R2 uses the single `R2_BUCKET`.
 */
export async function removeObjects(_bucket: string, files: StoredFile[]): Promise<void> {
  for (const file of files) {
    if (file.provider !== "r2") continue;
    try {
      await r2().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: file.path }));
    } catch {
      /* best-effort */
    }
  }
}

/** Build a `StoredFile` from a persisted row's two columns. New rows are always `r2`. */
export function toStoredFile(
  _storageProvider: string | null | undefined,
  filePath: string
): StoredFile {
  return { provider: "r2", path: filePath };
}

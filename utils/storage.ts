// Provider-agnostic private file storage — SERVER ONLY (DECISIONS D27).
//
// The app stores file bytes (Study Material notes F13, `file`-kind Homework F14) in
// a PRIVATE store and hands the browser short-lived, authorized URLs — never a
// public link. This module abstracts over TWO backends so the maintainer can keep
// uploading after the Supabase free-tier storage fills up:
//
//   * "supabase"   — a private Supabase Storage bucket + ~60s signed URLs (the
//                    original F13/F14 path).
//   * "cloudinary" — a private Cloudinary asset (type 'authenticated',
//                    resource_type 'raw') + signed delivery / expiring download URLs.
//
// Which backend NEW uploads use is chosen by `activeUploadProvider()` (the
// STORAGE_PROVIDER env var). Every file row records its own `storage_provider`, so
// files already on Supabase keep serving from Supabase even after the switch — the
// download/delete paths dispatch per-row, not per-env.
//
// Security is unchanged from the single-provider design: the bytes are never public,
// the Route Handler authorizes the caller on every request BEFORE calling
// `signedUrl`, and only then is a URL minted. Import this only from Route Handlers
// (or their server-only helpers) — it pulls in service-role / Cloudinary secrets.

import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { createAdminClient } from "@/utils/supabase/admin";

export type StorageProvider = "supabase" | "cloudinary";

/** How long a minted URL is valid, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 60;

/** A stored file reference persisted on the row (`storage_provider` + `file_path`). */
export type StoredFile = { provider: StorageProvider; path: string };

/**
 * The provider NEW uploads go to. Flip `STORAGE_PROVIDER=cloudinary` once the
 * Supabase free tier is full; leave unset (or `supabase`) to keep using Supabase.
 * Existing files are unaffected — each row carries its own provider.
 */
export function activeUploadProvider(): StorageProvider {
  return (process.env.STORAGE_PROVIDER ?? "").trim().toLowerCase() === "cloudinary"
    ? "cloudinary"
    : "supabase";
}

/** True when the three Cloudinary secrets are present. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

let cloudinaryConfigured = false;
function cld() {
  if (!isCloudinaryConfigured())
    throw new Error(
      "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    );
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    cloudinaryConfigured = true;
  }
  return cloudinary;
}

export type UploadInput = {
  /** Supabase bucket name; also used as the Cloudinary folder root (e.g. "study-material"). */
  bucket: string;
  /** Path segment under the bucket, no leading/trailing slash (e.g. `<batch>/<subject>`). */
  keyPrefix: string;
  /** File extension without a dot (e.g. "pdf", "png"). */
  ext: string;
  /** The file's MIME type (stored on Supabase objects; informational for Cloudinary raw). */
  contentType: string;
  /** The raw bytes. */
  bytes: Buffer;
  /** Override the target provider; defaults to `activeUploadProvider()`. */
  provider?: StorageProvider;
};

/**
 * Upload bytes to the chosen provider's PRIVATE store. Returns the `StoredFile` to
 * persist on the row. Throws on failure (the caller rolls back the DB row).
 */
export async function uploadObject(input: UploadInput): Promise<StoredFile> {
  const provider = input.provider ?? activeUploadProvider();
  const key = `${input.keyPrefix}/${randomUUID()}.${input.ext}`.replace(/\/+/g, "/");

  if (provider === "cloudinary") {
    // Store as a private, untouched 'raw' asset. Uploading everything as `raw`
    // (rather than 'image'/PDF-as-image) keeps the original bytes and dodges
    // Cloudinary's default block on delivering PDFs. The public_id carries the
    // real extension so the delivered file keeps its type/name.
    const publicId = `${input.bucket}/${key}`.replace(/\/+/g, "/");
    const client = cld();
    await new Promise<void>((resolve, reject) => {
      const stream = client.uploader.upload_stream(
        {
          resource_type: "raw",
          type: "authenticated",
          public_id: publicId,
          overwrite: false,
        },
        (err) => (err ? reject(err) : resolve())
      );
      stream.end(input.bytes);
    });
    return { provider, path: publicId };
  }

  // Supabase Storage (default).
  const admin = createAdminClient();
  const { error } = await admin.storage.from(input.bucket).upload(key, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw error;
  return { provider, path: key };
}

export type SignOptions = {
  /** Supabase bucket (needed only for supabase-backed files). */
  bucket: string;
  /** `download` forces an attachment with `fileName`; `view` opens inline. */
  mode: "view" | "download";
  /** Original filename, preserved on download. */
  fileName: string;
};

/**
 * Mint a short-lived, authorized URL to a stored file. Dispatches on the file's own
 * provider so Supabase- and Cloudinary-backed rows both work after a provider switch.
 * The caller MUST have already authorized the request.
 */
export async function signedUrl(file: StoredFile, opts: SignOptions): Promise<string> {
  if (file.provider === "cloudinary") {
    const client = cld();
    if (opts.mode === "download") {
      // Expiring signed link to the download endpoint — forces an attachment and
      // preserves the original filename. `format: ""` because the extension is
      // already part of the public_id (raw asset). `attachment` accepts a filename
      // string at runtime (its type declares only boolean), hence the cast.
      const dlOpts = {
        resource_type: "raw",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
        attachment: opts.fileName,
      } as unknown as Parameters<typeof client.utils.private_download_url>[2];
      return client.utils.private_download_url(file.path, "", dlOpts);
    }
    // Inline view: a signed 'authenticated' delivery URL. The signature makes the
    // URL unguessable; access is re-authorized by the route on every request.
    return client.url(file.path, {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      secure: true,
    });
  }

  // Supabase Storage: a ~60s signed URL from the private bucket.
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(opts.bucket)
    .createSignedUrl(
      file.path,
      SIGNED_URL_TTL_SECONDS,
      opts.mode === "download" ? { download: opts.fileName } : undefined
    );
  if (error || !data?.signedUrl) throw error ?? new Error("Failed to sign URL");
  return data.signedUrl;
}

/**
 * Best-effort delete of stored objects, grouped by provider so a mixed set (some on
 * Supabase, some on Cloudinary) is handled correctly. Never throws — deletion is a
 * cleanup step and a missing object shouldn't fail the request.
 */
export async function removeObjects(bucket: string, files: StoredFile[]): Promise<void> {
  const supabasePaths = files.filter((f) => f.provider === "supabase").map((f) => f.path);
  const cloudinaryIds = files.filter((f) => f.provider === "cloudinary").map((f) => f.path);

  if (supabasePaths.length > 0) {
    try {
      await createAdminClient().storage.from(bucket).remove(supabasePaths);
    } catch {
      /* best-effort */
    }
  }
  for (const publicId of cloudinaryIds) {
    try {
      await cld().uploader.destroy(publicId, { resource_type: "raw", type: "authenticated" });
    } catch {
      /* best-effort */
    }
  }
}

/** Build a `StoredFile` from a persisted row's two columns. */
export function toStoredFile(
  storageProvider: string | null | undefined,
  filePath: string
): StoredFile {
  return {
    provider: storageProvider === "cloudinary" ? "cloudinary" : "supabase",
    path: filePath,
  };
}

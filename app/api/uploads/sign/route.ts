// POST /api/uploads/sign — mint short-lived presigned PUT URLs so the browser can upload
// file bytes DIRECTLY to the private R2 bucket (never through this server). Used for
// large (up to 2 GB) Study-Material (F13) and file-Homework (F14) uploads — see D35.
//
// Teacher-only, and ownership is verified HERE (the object key is derived from a resource
// the caller owns), so a signed URL is only ever handed out for a batch/subject the
// teacher owns. The finalize step (`POST /api/study-materials` | `/api/homework`)
// re-verifies the uploaded objects and records the rows.

import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import {
  ACCEPTED_MIMES,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_FILES_PER_ITEM,
  STUDY_BUCKET,
  extForUpload,
  isAcceptedFile,
} from "@/utils/studyMaterial";
import { HOMEWORK_BUCKET } from "@/utils/homework";
import { SETTINGS_BUCKET } from "@/utils/settings";
import { presignPutUrl } from "@/utils/storage";

type IncomingFile = { name?: string; type?: string; size?: number };

/** An image mime? Banners are images only (no PDFs). */
function isImageUpload(mime: string, fileName: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const body = await request.json().catch(() => ({}));
    const scope = String(body?.scope ?? "").trim();
    const files: IncomingFile[] = Array.isArray(body?.files) ? body.files : [];

    if (scope !== "study-material" && scope !== "homework" && scope !== "banner")
      return bad("Unknown upload scope.");
    if (files.length === 0) return bad("At least one file is required.");
    if (files.length > MAX_FILES_PER_ITEM)
      return bad(`You can upload up to ${MAX_FILES_PER_ITEM} files at once.`);
    for (const f of files) {
      const name = (f.name || "").trim() || "file";
      // Banners are images only; study-material / homework accept PDF or image.
      const ok =
        scope === "banner"
          ? isImageUpload(f.type || "", name)
          : isAcceptedFile(f.type || "", name);
      if (!ok)
        return bad(
          scope === "banner"
            ? `"${name}": only image files are allowed for banners.`
            : `"${name}": only PDF or image files are allowed.`
        );
      if (typeof f.size === "number" && f.size > MAX_FILE_BYTES)
        return bad(`"${name}" is too large (max ${MAX_FILE_LABEL}).`);
    }

    // Resolve the target bucket + key prefix from a resource the teacher OWNS.
    let bucket: string;
    let keyPrefix: string;

    if (scope === "banner") {
      // Settings-owned; teacher role is authorization enough (no per-resource owner).
      bucket = SETTINGS_BUCKET;
      keyPrefix = "banners";
    } else if (scope === "study-material") {
      const subjectId = String(body?.subjectId ?? "").trim();
      if (!subjectId) return bad("A subject must be selected.");
      const { data: subject, error } = await supabase
        .from("subjects")
        .select("id, batch_id, teacher_id")
        .eq("id", subjectId)
        .maybeSingle();
      if (error) throw error;
      if (!subject) return bad("Selected subject was not found.", 404);
      if (subject.teacher_id !== user.id)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      bucket = STUDY_BUCKET;
      keyPrefix = `${subject.batch_id}/${subjectId}`;
    } else {
      const batchId = String(body?.batchId ?? "").trim();
      if (!batchId) return bad("A batch must be selected.");
      const { data: batch, error } = await supabase
        .from("batches")
        .select("id, teacher_id")
        .eq("id", batchId)
        .maybeSingle();
      if (error) throw error;
      if (!batch) return bad("Selected batch was not found.", 404);
      if (batch.teacher_id !== user.id)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      bucket = HOMEWORK_BUCKET;
      keyPrefix = batchId;
    }

    // Sign one PUT URL per file. The stored MIME is the accepted type (else a safe
    // PDF fallback); the browser MUST send that exact Content-Type on the PUT.
    const uploads = await Promise.all(
      files.map(async (f) => {
        const name = (f.name || "").trim() || "file";
        const mime = f.type || "";
        const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
          ? mime
          : "application/pdf";
        const { url, file, contentType } = await presignPutUrl({
          bucket,
          keyPrefix,
          ext: extForUpload(mime, name),
          contentType: storedMime,
        });
        return { url, key: file.path, contentType };
      })
    );

    return NextResponse.json({ uploads });
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

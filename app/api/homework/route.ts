import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";
import {
  ACCEPTED_MIMES,
  HOMEWORK_BUCKET,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_FILES_PER_ITEM,
  type HomeworkListItem,
  type StoredFileMeta,
} from "@/utils/homework";
import { extForUpload, isAcceptedFile } from "@/utils/studyMaterial";
import {
  copyObject,
  headObject,
  removeObjects,
  toStoredFile,
  type StoredFile,
} from "@/utils/storage";
import { filesByParent } from "@/utils/files";
import { notifyBatchStudents } from "@/utils/push";

type IncomingOption = { key: string; text: string };
type IncomingQuestion = {
  text: string;
  options: IncomingOption[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

function handleError(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 }
  );
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function mapRow(
  h: Record<string, unknown>,
  filesById: Map<string, StoredFileMeta[]>
): HomeworkListItem {
  const batches = h.batches as { name?: string } | { name?: string }[] | null;
  const batchName = Array.isArray(batches) ? batches[0]?.name : batches?.name;
  const counts = h.homework_questions as { count?: number }[] | null;
  const id = h.id as string;
  return {
    id,
    batch_id: h.batch_id as string,
    batch_name: batchName ?? null,
    type: h.type as "mcq" | "file",
    title: h.title as string,
    description: (h.description as string | null) ?? null,
    due_at: (h.due_at as string | null) ?? null,
    total_questions: (h.total_questions as number | null) ?? null,
    question_count: counts?.[0]?.count ?? 0,
    files: filesById.get(id) ?? [],
    status: h.status as "draft" | "published",
    is_published: Boolean(h.is_published),
    created_at: h.created_at as string,
  };
}

// GET /api/homework — the teacher's homework (optional ?batch=).
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const batchId = new URL(request.url).searchParams.get("batch");

    let query = supabase
      .from("homework")
      .select(
        "id, batch_id, type, title, description, due_at, total_questions, file_name, file_size, mime_type, status, is_published, created_at, batches(name), homework_questions(count)"
      )
      .eq("teacher_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (batchId) query = query.eq("batch_id", batchId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const fileHwIds = rows
      .filter((r) => r.type === "file")
      .map((r) => r.id as string);
    const filesById = await filesByParent(supabase, "homework_files", fileHwIds);
    return NextResponse.json(rows.map((r) => mapRow(r, filesById)));
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/homework — create homework. Both kinds post JSON:
//  * `questions` present → an MCQ homework (`type:'mcq'`) with its questions.
//  * `type:'file'` / a `files` array → a FILE homework whose PDF/image bytes were
//    already uploaded DIRECTLY to R2 by the browser (presigned PUT, D35); the array
//    carries the resulting object keys to record.
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    return bad("Expected a JSON body.");
  const body = await request.json().catch(() => ({}));
  if (body?.type === "file" || Array.isArray(body?.files))
    return createFileHomework(body);
  return createMcqHomework(body);
}

// Normalise the multi-batch `batchIds` (≥1) or the legacy single `batchId` into a
// de-duplicated list of target batch ids (D33).
function resolveBatchIds(batchId?: string, batchIds?: string[]) {
  return Array.from(
    new Set([...(batchIds ?? []), ...(batchId ? [batchId] : [])].filter(Boolean))
  );
}

// Verify EVERY batch belongs to the caller. Returns a NextResponse on failure, or null.
async function assertBatchesOwned(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  batchIds: string[],
  userId: string
) {
  const { data: rows, error } = await supabase
    .from("batches")
    .select("id, teacher_id")
    .in("id", batchIds);
  if (error) throw error;
  const owned = rows ?? [];
  if (owned.length !== batchIds.length)
    return bad("A selected batch was not found.", 404);
  if (owned.some((b) => b.teacher_id !== userId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

async function createMcqHomework(body: Record<string, unknown>) {
  try {
    const { supabase, user } = await requireTeacher();
    const {
      title,
      batchId,
      batchIds,
      description,
      dueAt,
      totalQuestions,
      marksPerQuestion,
      negativeMarking,
      status,
      questions,
    } = body as {
      title?: string;
      batchId?: string;
      batchIds?: string[];
      description?: string;
      dueAt?: string | null;
      totalQuestions?: number;
      marksPerQuestion?: number;
      negativeMarking?: number;
      status?: "draft" | "published";
      questions?: IncomingQuestion[];
    };

    const targetBatchIds = resolveBatchIds(batchId, batchIds);

    if (!title?.trim()) return bad("A homework title is required.");
    if (targetBatchIds.length === 0) return bad("At least one batch must be selected.");
    if (!Array.isArray(questions) || questions.length === 0)
      return bad("At least one question is required.");

    const owned = await assertBatchesOwned(supabase, targetBatchIds, user.id);
    if (owned) return owned;

    const publish = status === "published";
    const cleanTitle = title.trim();

    // Fan out: one MCQ homework (+ its questions) per selected batch (D33).
    const created: { id: string; status: string }[] = [];
    for (const bId of targetBatchIds) {
      const { data: hw, error: hwErr } = await supabase
        .from("homework")
        .insert({
          batch_id: bId,
          teacher_id: user.id,
          type: "mcq",
          title: cleanTitle,
          description: description?.trim() || null,
          due_at: dueAt || null,
          total_questions: totalQuestions ?? questions.length,
          marks_per_question: marksPerQuestion ?? 1,
          negative_marking: negativeMarking ?? 0,
          status: publish ? "published" : "draft",
          is_published: publish,
        })
        .select("id, status")
        .single();
      if (hwErr) throw hwErr;

      const rows = questions.map((q, i) => ({
        homework_id: hw.id,
        question_text: q.text,
        options: q.options,
        correct_answer: q.correctOptionKey,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        order: i,
      }));

      const { error: qErr } = await supabase.from("homework_questions").insert(rows);
      if (qErr) {
        // Roll back this batch's homework so it's never left with no questions.
        await supabase.from("homework").delete().eq("id", hw.id);
        throw qErr;
      }

      created.push({ id: hw.id as string, status: hw.status as string });

      // Notify enrolled students of newly-published homework (F15; best-effort).
      if (publish) {
        await notifyBatchStudents(bId, {
          type: "homework",
          refId: hw.id as string,
          title: "New homework",
          body: cleanTitle,
          url: `/student/homework/${hw.id as string}`,
        });
      }
    }

    return NextResponse.json({
      id: created[0].id,
      status: created[0].status,
      ids: created.map((c) => c.id),
      count: created.length,
    });
  } catch (error) {
    return handleError(error);
  }
}

type IncomingUpload = { key?: string; name?: string; size?: number; type?: string };

async function createFileHomework(body: Record<string, unknown>) {
  try {
    const { supabase, user } = await requireTeacher();

    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const dueAt = String(body?.dueAt ?? "").trim();
    const statusRaw = String(body?.status ?? "draft").trim();
    const targetBatchIds = resolveBatchIds(
      String(body?.batchId ?? "").trim() || undefined,
      Array.isArray(body?.batchIds)
        ? (body.batchIds as unknown[]).map((b) => String(b).trim()).filter(Boolean)
        : []
    );
    const uploads: IncomingUpload[] = Array.isArray(body?.files)
      ? (body.files as IncomingUpload[])
      : [];

    if (!title) return bad("A homework title is required.");
    if (targetBatchIds.length === 0) return bad("At least one batch must be selected.");
    if (uploads.length === 0)
      return bad("At least one PDF or image file is required.");
    if (uploads.length > MAX_FILES_PER_ITEM)
      return bad(`You can attach up to ${MAX_FILES_PER_ITEM} files at once.`);
    for (const u of uploads) {
      const fileName = (u.name || "").trim() || "homework";
      if (!u.key || typeof u.key !== "string")
        return bad(`"${fileName}": upload was not completed.`);
      if (!isAcceptedFile(u.type || "", fileName))
        return bad(`"${fileName}": only PDF or image files are allowed.`);
    }

    const owned = await assertBatchesOwned(supabase, targetBatchIds, user.id);
    if (owned) return owned;

    // The browser uploaded to ONE batch's prefix; derive that origin batch from the keys
    // (`homework/<batchId>/…`) and require it to be one of the owned targets. Verify each
    // object exists in R2 (HEAD gives the authoritative size).
    const originBatchId = String(uploads[0].key).split("/")[1] ?? "";
    if (!targetBatchIds.includes(originBatchId))
      return bad("Upload keys do not match the selected batches.");
    const originPrefix = `${HOMEWORK_BUCKET}/${originBatchId}/`;
    const sources: {
      file: StoredFile;
      fileName: string;
      storedMime: string;
      size: number;
    }[] = [];
    for (const u of uploads) {
      const fileName = (u.name || "").trim() || "homework";
      const key = u.key as string;
      if (!key.startsWith(originPrefix))
        return bad(`"${fileName}": upload key does not match the selected batch.`);
      const mime = u.type || "";
      const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
        ? mime
        : "application/pdf";
      const file = toStoredFile("r2", key);
      const head = await headObject(file);
      if (!head) return bad(`"${fileName}": the upload was not found — please retry.`);
      if (head.size > MAX_FILE_BYTES)
        return bad(`"${fileName}" is too large (max ${MAX_FILE_LABEL}).`);
      sources.push({ file, fileName, storedMime, size: head.size });
    }

    const publish = statusRaw === "published";

    // Fan out: one file homework per selected batch. The origin batch uses the uploaded
    // objects as-is; each other batch gets a server-side COPY (R2→R2, no bytes through
    // this server — D33), living under its own `<batch_id>/…` prefix.
    const created: { id: string; status: string }[] = [];
    for (const bId of targetBatchIds) {
      const isOrigin = bId === originBatchId;
      const { data: hw, error: insErr } = await supabase
        .from("homework")
        .insert({
          batch_id: bId,
          teacher_id: user.id,
          type: "file",
          title,
          description: description || null,
          due_at: dueAt || null,
          status: publish ? "published" : "draft",
          is_published: publish,
        })
        .select("id, status")
        .single();
      if (insErr) throw insErr;

      // Attach each file (origin: the uploaded object; other: a copy) and record a child
      // row. Any failure rolls back this batch's own objects AND parent.
      const madeCopies: StoredFile[] = [];
      try {
        const childRows = [];
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          let stored = s.file;
          if (!isOrigin) {
            stored = await copyObject(s.file, {
              bucket: HOMEWORK_BUCKET,
              keyPrefix: bId,
              ext: extForUpload(s.storedMime, s.fileName),
            });
            madeCopies.push(stored);
          }
          childRows.push({
            homework_id: hw.id as string,
            storage_provider: stored.provider,
            file_path: stored.path,
            file_name: s.fileName,
            file_size: s.size,
            mime_type: s.storedMime,
            order: i,
          });
        }

        const { error: filesErr } = await supabase
          .from("homework_files")
          .insert(childRows);
        if (filesErr) throw filesErr;
      } catch (err) {
        await removeObjects(HOMEWORK_BUCKET, isOrigin ? sources.map((s) => s.file) : madeCopies);
        await supabase.from("homework").delete().eq("id", hw.id);
        throw err;
      }

      created.push({ id: hw.id as string, status: hw.status as string });

      // Notify enrolled students of newly-published homework (F15; best-effort).
      if (publish) {
        await notifyBatchStudents(bId, {
          type: "homework",
          refId: hw.id as string,
          title: "New homework",
          body: title,
          url: `/student/homework/${hw.id as string}`,
        });
      }
    }

    return NextResponse.json({
      id: created[0].id,
      status: created[0].status,
      ids: created.map((c) => c.id),
      count: created.length,
    });
  } catch (error) {
    return handleError(error);
  }
}

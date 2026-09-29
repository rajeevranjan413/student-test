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
import { removeObjects, uploadObject, type StoredFile } from "@/utils/storage";
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

// POST /api/homework — create homework.
//  * JSON body  → an MCQ homework (`type:'mcq'`) with its questions.
//  * multipart  → a FILE homework (`type:'file'`) with an uploaded PDF/image.
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) return createFileHomework(request);
  return createMcqHomework(request);
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

async function createMcqHomework(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const body = await request.json();
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

async function createFileHomework(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const dueAt = String(form.get("dueAt") ?? "").trim();
    const statusRaw = String(form.get("status") ?? "draft").trim();
    const targetBatchIds = resolveBatchIds(
      String(form.get("batchId") ?? "").trim() || undefined,
      form.getAll("batchIds").map((b) => String(b).trim()).filter(Boolean)
    );
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (!title) return bad("A homework title is required.");
    if (targetBatchIds.length === 0) return bad("At least one batch must be selected.");
    if (files.length === 0)
      return bad("At least one PDF or image file is required.");
    if (files.length > MAX_FILES_PER_ITEM)
      return bad(`You can attach up to ${MAX_FILES_PER_ITEM} files at once.`);
    for (const file of files) {
      const fileName = file.name || "homework";
      if (!isAcceptedFile(file.type || "", fileName))
        return bad(`"${fileName}": only PDF or image files are allowed.`);
      if (file.size > MAX_FILE_BYTES)
        return bad(`"${fileName}" is too large (max ${MAX_FILE_LABEL}).`);
    }

    const owned = await assertBatchesOwned(supabase, targetBatchIds, user.id);
    if (owned) return owned;

    const publish = statusRaw === "published";

    // Read each file's bytes ONCE, then re-upload them for every target batch (D33) —
    // each batch's objects live under its own `<batch_id>/…` prefix.
    const buffered = await Promise.all(
      files.map(async (file) => {
        const fileName = file.name || "homework";
        const mime = file.type || "";
        const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
          ? mime
          : "application/pdf";
        return {
          fileName,
          mime,
          storedMime,
          size: file.size,
          bytes: Buffer.from(await file.arrayBuffer()),
        };
      })
    );

    // Fan out: one file homework (+ its uploaded files) per selected batch.
    const created: { id: string; status: string }[] = [];
    for (const bId of targetBatchIds) {
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

      // Upload each buffered file to the active provider's private store (D27) and
      // record a child row. Any failure rolls back this batch's objects AND parent.
      const uploaded: StoredFile[] = [];
      try {
        const childRows = [];
        for (let i = 0; i < buffered.length; i++) {
          const f = buffered[i];
          const stored = await uploadObject({
            bucket: HOMEWORK_BUCKET,
            keyPrefix: bId,
            ext: extForUpload(f.mime, f.fileName),
            contentType: f.storedMime,
            bytes: f.bytes,
          });
          uploaded.push(stored);
          childRows.push({
            homework_id: hw.id as string,
            storage_provider: stored.provider,
            file_path: stored.path,
            file_name: f.fileName,
            file_size: f.size,
            mime_type: f.storedMime,
            order: i,
          });
        }

        const { error: filesErr } = await supabase
          .from("homework_files")
          .insert(childRows);
        if (filesErr) throw filesErr;
      } catch (err) {
        await removeObjects(HOMEWORK_BUCKET, uploaded);
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

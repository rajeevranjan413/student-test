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

// Verify a batch belongs to the caller. Returns a NextResponse on failure, or null.
async function assertBatchOwned(
  supabase: Awaited<ReturnType<typeof requireTeacher>>["supabase"],
  batchId: string,
  userId: string
) {
  const { data: batch, error } = await supabase
    .from("batches")
    .select("id, teacher_id")
    .eq("id", batchId)
    .single();
  if (error || !batch) return bad("Selected batch was not found.", 404);
  if (batch.teacher_id !== userId)
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
      description?: string;
      dueAt?: string | null;
      totalQuestions?: number;
      marksPerQuestion?: number;
      negativeMarking?: number;
      status?: "draft" | "published";
      questions?: IncomingQuestion[];
    };

    if (!title?.trim()) return bad("A homework title is required.");
    if (!batchId) return bad("A batch must be selected.");
    if (!Array.isArray(questions) || questions.length === 0)
      return bad("At least one question is required.");

    const owned = await assertBatchOwned(supabase, batchId, user.id);
    if (owned) return owned;

    const publish = status === "published";

    const { data: hw, error: hwErr } = await supabase
      .from("homework")
      .insert({
        batch_id: batchId,
        teacher_id: user.id,
        type: "mcq",
        title: title.trim(),
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
      // Roll back so we never leave an MCQ homework with no questions.
      await supabase.from("homework").delete().eq("id", hw.id);
      throw qErr;
    }

    // Notify enrolled students of newly-published homework (F15; best-effort).
    if (publish) {
      await notifyBatchStudents(batchId, {
        type: "homework",
        refId: hw.id as string,
        title: "New homework",
        body: title.trim(),
        url: `/student/homework/${hw.id as string}`,
      });
    }

    return NextResponse.json({ id: hw.id, status: hw.status });
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
    const batchId = String(form.get("batchId") ?? "").trim();
    const dueAt = String(form.get("dueAt") ?? "").trim();
    const statusRaw = String(form.get("status") ?? "draft").trim();
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (!title) return bad("A homework title is required.");
    if (!batchId) return bad("A batch must be selected.");
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

    const owned = await assertBatchOwned(supabase, batchId, user.id);
    if (owned) return owned;

    const publish = statusRaw === "published";

    // --- Insert the homework parent first (files hang off it) ---
    const { data: hw, error: insErr } = await supabase
      .from("homework")
      .insert({
        batch_id: batchId,
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

    // --- Upload each file to the active provider's private store (D27) and record a
    // child row. Any failure rolls back the objects AND the homework parent. ---
    const uploaded: StoredFile[] = [];
    try {
      const childRows = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || "homework";
        const mime = file.type || "";
        const storedMime = (ACCEPTED_MIMES as readonly string[]).includes(mime)
          ? mime
          : "application/pdf";
        const stored = await uploadObject({
          bucket: HOMEWORK_BUCKET,
          keyPrefix: batchId,
          ext: extForUpload(mime, fileName),
          contentType: storedMime,
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        uploaded.push(stored);
        childRows.push({
          homework_id: hw.id as string,
          storage_provider: stored.provider,
          file_path: stored.path,
          file_name: fileName,
          file_size: file.size,
          mime_type: storedMime,
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

    // Notify enrolled students of newly-published homework (F15; best-effort).
    if (publish) {
      await notifyBatchStudents(batchId, {
        type: "homework",
        refId: hw.id as string,
        title: "New homework",
        body: title,
        url: `/student/homework/${hw.id as string}`,
      });
    }

    return NextResponse.json({ id: hw.id, status: hw.status });
  } catch (error) {
    return handleError(error);
  }
}

import { NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/utils/auth";

// 1. READ ALL (GET) — teacher only. Excludes archived batches by default.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireTeacher();
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";

    let query = supabase
      .from("batches")
      .select("id, name, start_time, end_time, description, exam_level, secret_pass, status, created_at")
      .order("created_at", { ascending: false });

    if (!includeArchived) query = query.eq("status", "active");

    const { data, error } = await query;
    if (error) throw error;

    const batches = data ?? [];
    const ids = batches.map((b) => b.id as string);

    // Student & test counts per batch (teacher SELECT policies cover both tables).
    const studentCounts = new Map<string, number>();
    const testCounts = new Map<string, number>();
    if (ids.length > 0) {
      const [{ data: enrollments, error: eErr }, { data: quizzes, error: qErr }] =
        await Promise.all([
          supabase.from("student_batches").select("batch_id").in("batch_id", ids),
          supabase.from("quizzes").select("batch_id").in("batch_id", ids),
        ]);
      if (eErr) throw eErr;
      if (qErr) throw qErr;
      for (const row of enrollments ?? []) {
        const bid = row.batch_id as string;
        studentCounts.set(bid, (studentCounts.get(bid) ?? 0) + 1);
      }
      for (const row of quizzes ?? []) {
        const bid = row.batch_id as string;
        if (bid) testCounts.set(bid, (testCounts.get(bid) ?? 0) + 1);
      }
    }

    const rows = batches.map((b) => ({
      ...b,
      student_count: studentCounts.get(b.id as string) ?? 0,
      test_count: testCounts.get(b.id as string) ?? 0,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 2. CREATE (POST) — teacher only.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireTeacher();
    const { name, start_time, end_time, secret_pass, description, exam_level } =
      await request.json();

    if (!name || !start_time || !end_time || !secret_pass) {
      return NextResponse.json(
        { error: "name, start_time, end_time, and secret_pass are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("batches")
      .insert({
        name,
        start_time,
        end_time,
        secret_pass,
        description: description ?? null,
        exam_level: exam_level ?? null,
        teacher_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

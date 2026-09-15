import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Public, no-auth list of active batches for the student signup dropdown.
 * Exposes ONLY public-safe fields (id, name, course) — never `secret_pass`.
 * Uses the service role on the server so it works before a session exists.
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("batches")
      .select("id, name, course")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/utils/auth";

export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    return NextResponse.json({ message: "Logged out successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

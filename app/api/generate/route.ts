import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AuthError, requireTeacher } from "@/utils/auth";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// `gemini-3.8-flash` (previous value) is not a real model id. Use a valid
// multimodal Flash model; override via env if a newer one is preferred.
const MODEL_ID = process.env.GEMINI_MODEL || "gemini-2.0-flash";

type Option = { key: string; text: string };
export type GeneratedQuestion = {
  text: string;
  options: Option[];
  correctOptionKey: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

const VALID_KEYS = ["A", "B", "C", "D"];

/** Strip markdown fences / prose and parse the first JSON object/array found. */
function parseModelJson(raw: string): unknown {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to extracting the outermost {...} or [...] block.
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Model did not return valid JSON");
  }
}

/** Keep only well-formed questions; silently drop malformed candidates. */
function validateQuestions(parsed: unknown): GeneratedQuestion[] {
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { questions?: unknown[] })?.questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

  const out: GeneratedQuestion[] = [];
  for (const raw of list) {
    const q = raw as Record<string, unknown>;
    const text = typeof q.text === "string" ? q.text.trim() : "";

    // Normalise options: accept [{key,text}] or a bare string[] and re-key A–D.
    let options: Option[] = [];
    if (Array.isArray(q.options)) {
      options = q.options.map((o, i) => {
        if (o && typeof o === "object" && "text" in o) {
          const oo = o as Record<string, unknown>;
          return {
            key: typeof oo.key === "string" ? oo.key.toUpperCase() : VALID_KEYS[i],
            text: String(oo.text ?? "").trim(),
          };
        }
        return { key: VALID_KEYS[i], text: String(o).trim() };
      });
    }

    const correctOptionKey =
      typeof q.correctOptionKey === "string"
        ? q.correctOptionKey.toUpperCase()
        : typeof q.correct_answer === "string"
          ? q.correct_answer.toUpperCase()
          : "";

    const difficultyRaw = String(q.difficulty ?? "medium").toLowerCase();
    const difficulty = (["easy", "medium", "hard"].includes(difficultyRaw)
      ? difficultyRaw
      : "medium") as GeneratedQuestion["difficulty"];

    // Drop anything without a question, exactly 4 options, and a valid key.
    const keys = options.map((o) => o.key);
    if (
      text &&
      options.length === 4 &&
      options.every((o) => o.text) &&
      keys.includes(correctOptionKey)
    ) {
      out.push({
        text,
        options,
        correctOptionKey,
        explanation:
          typeof q.explanation === "string" ? q.explanation.trim() : "",
        difficulty,
      });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    await requireTeacher(); // Admin-only: keeps AI usage and the API key server-side.

    const formData = await req.formData();

    // Accept multiple images ("images") or a single legacy "image".
    const images = [
      ...formData.getAll("images"),
      ...formData.getAll("image"),
    ].filter((v): v is File => v instanceof File && v.size > 0);

    const examLevel = (formData.get("examLevel") as string) || "";
    const count = Math.min(
      Math.max(parseInt((formData.get("count") as string) || "5", 10) || 5, 1),
      20
    );
    // `extraPrompt` is the admin's free-text; `prompt` kept for backward compat.
    const extraPrompt =
      (formData.get("extraPrompt") as string) ||
      (formData.get("prompt") as string) ||
      "";

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one image." },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    const instruction = `You are an exam question setter for competitive exams.
Read the concept(s) shown in the attached image(s) — handwritten or printed — and
generate exactly ${count} multiple-choice questions${
      examLevel ? ` for the "${examLevel}" level` : ""
    }.
${extraPrompt ? `Additional instructions from the teacher: ${extraPrompt}\n` : ""}
Rules:
- Each question must have exactly 4 options keyed "A","B","C","D".
- Exactly one correct option; put its key in "correctOptionKey".
- Include a short "explanation" and a "difficulty" of "easy", "medium", or "hard".
Respond with STRICT JSON ONLY (no markdown, no prose) in this exact shape:
{"questions":[{"text":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctOptionKey":"B","explanation":"...","difficulty":"medium"}]}`;

    const imageParts = await Promise.all(
      images.map(async (img) => ({
        inlineData: {
          data: Buffer.from(await img.arrayBuffer()).toString("base64"),
          mimeType: img.type || "image/png",
        },
      }))
    );

    const result = await model.generateContent([instruction, ...imageParts]);
    const responseText = result.response.text();

    let questions: GeneratedQuestion[];
    try {
      questions = validateQuestions(parseModelJson(responseText));
    } catch {
      return NextResponse.json(
        { error: "The AI returned an unreadable response. Please retry." },
        { status: 502 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No valid questions were generated. Try again or adjust the prompt." },
        { status: 502 }
      );
    }

    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: "Failed to generate questions. Please retry." },
      { status: 500 }
    );
  }
}

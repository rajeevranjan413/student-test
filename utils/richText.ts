// Helpers for question / explanation content (D31). A stored value in
// `question_text` / `explanation` is self-describing and may be one of:
//   * plain text        — legacy + AI-generated questions (rendered as-is);
//   * a formatting-HTML  — a small subset the manual editor's Text tab emits;
//   * an inline image    — a `data:image/…;base64,…` URI from the Image tab.
// These are pure string functions — safe on both the server and the client.

/** Tags the rich-text editor is allowed to emit; everything else is stripped. */
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li"] as const;
const ALLOWED_TAG_SET: ReadonlySet<string> = new Set<string>(ALLOWED_TAGS);
const TAG_ALTERNATION = ALLOWED_TAGS.join("|");

/** True when the value is an inline image we stored as a data: URI (Image tab). */
export function isImageContent(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\s*data:image\//i.test(value);
}

/** True when the value carries any of our allowlisted formatting tags. */
export function containsFormatting(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return new RegExp(`<\\/?(?:${TAG_ALTERNATION})\\b[^>]*>`, "i").test(value);
}

/**
 * Reduce a string to the allowlisted formatting tags with **no attributes**.
 * `<script>`/`<style>` blocks (and their contents) and comments are removed
 * outright; every surviving tag keeps only its name, so no event handlers or
 * `javascript:` URLs can ride in. Called at render time as the safety net for
 * teacher-authored HTML.
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (typeof input !== "string" || !input) return "";
  let html = input.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g, (match, rawName: string) => {
    const tag = rawName.toLowerCase();
    if (!ALLOWED_TAG_SET.has(tag)) return "";
    return match.slice(0, 2) === "</" ? `</${tag}>` : `<${tag}>`;
  });
  return html;
}

/**
 * True when a value carries no meaningful content — used to validate the editor
 * (an empty rich-text field is just `<br>`/`<p></p>`/`&nbsp;`/whitespace). Image
 * data URIs are always considered non-blank.
 */
export function isBlankContent(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  if (isImageContent(value)) return false;
  const stripped = value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return stripped.length === 0;
}

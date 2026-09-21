import type { CSSProperties } from "react";
import { containsFormatting, isImageContent, sanitizeHtml } from "@/utils/richText";

/**
 * Renders a question stem or explanation (D31). The stored value is self-describing:
 *   * a `data:image/…` URI  → an inline `<img>` (horizontal screenshots scale to fit);
 *   * formatting-HTML       → sanitized HTML (attribute-free allowlist);
 *   * anything else         → plain text (React-escaped) — legacy + AI questions.
 * Used at every admin preview + student take/review site so the three forms render
 * consistently everywhere.
 */
export function QuestionContent({
  value,
  style,
  className,
  imageStyle,
}: {
  value: string | null | undefined;
  style?: CSSProperties;
  className?: string;
  imageStyle?: CSSProperties;
}) {
  if (value == null || value === "") return null;

  if (isImageContent(value)) {
    return (
      // Teacher-authored, self-contained data: URI (never a remote/user-injectable
      // src) — safe to render directly; not a candidate for next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value.trim()}
        alt="Question image"
        className={className}
        style={{
          maxWidth: "100%",
          height: "auto",
          borderRadius: 8,
          display: "block",
          ...imageStyle,
        }}
      />
    );
  }

  if (containsFormatting(value)) {
    return (
      <div
        className={className ? `question-content ${className}` : "question-content"}
        style={style}
        // Sanitized to an attribute-free allowlist — see utils/richText#sanitizeHtml.
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }

  // Plain text (legacy + AI-generated): render as children so React escapes it.
  return (
    <span className={className} style={style}>
      {value}
    </span>
  );
}

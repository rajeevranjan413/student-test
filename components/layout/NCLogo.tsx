import * as React from "react";

/**
 * Brand logo for NeerajCompetitiveClasses: a rounded badge with the "NC"
 * monogram, drawn as an inline SVG so it stays crisp at any size and inherits
 * the surrounding text color (`currentColor` fills the badge; the letters are
 * knocked out in white). Used as the leading brand mark in the app bar.
 */
export function NCLogo({
  className = "h-7 w-7",
  title = "NeerajCompetitiveClasses",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        fontSize="14"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#ffffff"
      >
        NC
      </text>
    </svg>
  );
}

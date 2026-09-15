import type { CSSProperties, ReactNode } from "react";

/**
 * Shared page wrapper for the antd admin/student screens so every page shares the
 * same max-width and a mobile-first, fluid gutter (16px on phones → 24px on
 * desktop) instead of each page hardcoding its own padding/maxWidth.
 */
export function PageContainer({
  children,
  max = 1120,
  style,
}: {
  children: ReactNode;
  max?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        maxWidth: max,
        margin: "0 auto",
        padding: "clamp(16px, 4vw, 24px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

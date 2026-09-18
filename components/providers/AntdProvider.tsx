"use client";

import * as React from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import { useTheme } from "next-themes";

/**
 * Wraps antd for the App Router: AntdRegistry handles SSR style extraction,
 * ConfigProvider syncs antd's light/dark algorithm with next-themes and sets
 * the brand primary color to match the existing Tailwind pages (#2563eb).
 *
 * Dark-mode-on-reload fix (see docs/FEATURES.md → F11 Notes):
 * next-themes can't know the resolved theme during SSR / the first client render
 * (`resolvedTheme` is `undefined`), so antd's SSR styles are always extracted in
 * the LIGHT algorithm. On a hard reload the page paints with those light antd
 * styles even though next-themes has already set `.dark` on <html> pre-paint —
 * so antd cards/tables/panels render white on the dark page. The styles only get
 * regenerated dark once the antd subtree remounts, which is why a client
 * navigation "fixed" it. We reproduce that remount deterministically: gate on a
 * `mounted` flag (matching ThemeToggle) and key the theme layer by it, so the
 * antd tree remounts exactly once after hydration with the resolved theme. The
 * key stays constant afterwards, so later theme toggles update in place and don't
 * drop React state (form inputs, etc.).
 */
const emptySubscribe = () => () => {};

export function AntdProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  // `false` on the server and the first client render (so hydration matches the
  // light-themed SSR markup), then `true` — the standard hydration-detection hook.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Before mount `resolvedTheme` is unreliable (undefined on SSR + first paint),
  // so keep antd on the light algorithm to match the SSR-extracted styles and
  // avoid a hydration mismatch. Once mounted, honour the real resolved theme.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <AntdRegistry>
      <ConfigProvider
        // Remount once (ssr → mounted) so the resolved theme's styles are applied
        // on hard reload; unchanged across subsequent toggles.
        key={mounted ? "mounted" : "ssr"}
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          // Premium, product-grade design tokens shared by every antd admin/student
          // screen. Colours track the Tailwind design tokens in globals.css so the
          // antd pages and the Tailwind pages read as one system. Card resting
          // shadows + hover lift are added in globals.css (antd has no resting-card
          // shadow token). Keep values algorithm-neutral so dark mode stays correct.
          token: {
            colorPrimary: isDark ? "#3b82f6" : "#2563eb",
            colorInfo: isDark ? "#3b82f6" : "#2563eb",
            borderRadius: 10,
            borderRadiusLG: 14,
            borderRadiusSM: 8,
            controlHeight: 38,
            fontSize: 14,
            wireframe: false,
            fontFamily:
              "var(--font-sans, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)",
            colorBorderSecondary: isDark ? "#27272a" : "#eef1f5",
          },
          components: {
            Card: {
              borderRadiusLG: 16,
              paddingLG: 24,
              headerFontSize: 16,
              headerHeight: 56,
            },
            Button: {
              controlHeight: 40,
              controlHeightSM: 32,
              controlHeightLG: 46,
              fontWeight: 500,
              borderRadius: 10,
              primaryShadow: "0 1px 2px rgba(37,99,235,0.28)",
              defaultShadow: "none",
              dangerShadow: "none",
            },
            Statistic: {
              contentFontSize: 30,
              titleFontSize: 13,
            },
            Table: {
              headerBg: isDark ? "#161618" : "#f8fafc",
              headerColor: isDark ? "#a1a1aa" : "#64748b",
              headerSplitColor: "transparent",
              borderColor: isDark ? "#27272a" : "#eef1f5",
              rowHoverBg: isDark ? "#161618" : "#f8fafc",
              cellPaddingBlock: 14,
              headerBorderRadius: 12,
            },
            Input: { controlHeight: 40, borderRadius: 10, paddingBlock: 8 },
            InputNumber: { controlHeight: 40, borderRadius: 10 },
            Select: { controlHeight: 40, borderRadius: 10 },
            DatePicker: { controlHeight: 40, borderRadius: 10 },
            Segmented: { borderRadius: 10, controlHeight: 38 },
            Tag: { borderRadiusSM: 8 },
            Modal: { borderRadiusLG: 16 },
            Tabs: { titleFontSize: 15 },
          },
        }}
      >
        {/* component={false} → no wrapping DOM node, so Tailwind pages are untouched,
            but message/notification/modal still get proper React context. */}
        <AntdApp component={false}>{children}</AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}

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
          token: { colorPrimary: "#2563eb", borderRadius: 8 },
        }}
      >
        {/* component={false} → no wrapping DOM node, so Tailwind pages are untouched,
            but message/notification/modal still get proper React context. */}
        <AntdApp component={false}>{children}</AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}

"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import { useTheme } from "next-themes";

/**
 * Wraps antd for the App Router: AntdRegistry handles SSR style extraction,
 * ConfigProvider syncs antd's light/dark algorithm with next-themes and sets
 * the brand primary color to match the existing Tailwind pages (#2563eb).
 */
export function AntdProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <AntdRegistry>
      <ConfigProvider
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

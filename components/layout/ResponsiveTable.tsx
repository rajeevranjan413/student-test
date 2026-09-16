"use client";

import { useEffect, useState } from "react";
import type { Key, ReactNode } from "react";
import { Card, Empty, Spin, Typography } from "antd";
import { Table } from "antd";
import type { TableProps } from "antd";
import type { ColumnType, ColumnsType } from "antd/es/table";

const { Text } = Typography;

/**
 * Below `breakpoint` px, render each table row as a stacked card (label → value)
 * instead of an AntD Table, so admin lists stay readable on phones without
 * horizontal scrolling. The same `columns`/`dataSource` drive both layouts, so
 * pages get a mobile view for free by swapping <Table> → <ResponsiveTable>.
 *
 * On desktop it is a thin pass-through to AntD <Table> — every prop is forwarded
 * unchanged, so sorting/filtering/pagination behave exactly as before.
 */
function useIsMobile(breakpoint: number) {
  // Start `false` so SSR and the first client render both produce the desktop
  // Table (identical markup → no hydration mismatch); we flip to cards after mount.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

function valueAt<T>(record: T, dataIndex: ColumnType<T>["dataIndex"]): unknown {
  if (dataIndex == null) return undefined;
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce<unknown>(
      (acc, k) =>
        acc == null
          ? acc
          : (acc as Record<PropertyKey, unknown>)[k as PropertyKey],
      record
    );
  }
  return (record as Record<PropertyKey, unknown>)[dataIndex as PropertyKey];
}

export function ResponsiveTable<T extends object>(
  props: TableProps<T> & { breakpoint?: number }
) {
  const { breakpoint = 768, ...tableProps } = props;
  const isMobile = useIsMobile(breakpoint);

  if (!isMobile) return <Table<T> {...tableProps} />;

  const { columns, dataSource, rowKey, loading, onRow, locale } = tableProps;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
        <Spin />
      </div>
    );
  }

  const rows = (dataSource ?? []) as readonly T[];
  if (rows.length === 0) {
    return <>{locale?.emptyText ?? <Empty description="No data" />}</>;
  }

  const cols = (columns ?? []) as ColumnsType<T>;

  const keyOf = (record: T, index: number): Key => {
    if (typeof rowKey === "function") return rowKey(record);
    if (typeof rowKey === "string") {
      const k = (record as Record<string, unknown>)[rowKey];
      return (k as Key) ?? index;
    }
    return index;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((record, index) => {
        const rowProps = onRow?.(record, index);
        const clickable = typeof rowProps?.onClick === "function";
        return (
          <Card
            key={keyOf(record, index)}
            size="small"
            hoverable={clickable}
            onClick={rowProps?.onClick}
            style={{
              cursor: clickable ? "pointer" : undefined,
              ...(rowProps?.style ?? {}),
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cols.map((col, ci) => {
                const c = col as ColumnType<T>;
                const raw = valueAt(record, c.dataIndex);
                const content = (c.render
                  ? c.render(raw, record, index)
                  : (raw as ReactNode)) as ReactNode;
                if (content == null || content === "") return null;

                const label =
                  typeof c.title === "function" ? undefined : (c.title as ReactNode);
                const hasLabel = label != null && label !== "";
                // The first column is treated as the card's heading (no label,
                // full width) — usually the name/title of the row.
                const isHeading = ci === 0;

                if (isHeading) {
                  return (
                    <div key={c.key ?? ci} style={{ fontSize: 15 }}>
                      {content}
                    </div>
                  );
                }

                return (
                  <div
                    key={c.key ?? ci}
                    style={{
                      display: "flex",
                      justifyContent: hasLabel ? "space-between" : "flex-start",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    {hasLabel && (
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, flexShrink: 0 }}
                      >
                        {label}
                      </Text>
                    )}
                    <div
                      style={{
                        textAlign: hasLabel ? "right" : "left",
                        minWidth: 0,
                        flex: 1,
                        wordBreak: "break-word",
                      }}
                    >
                      {content}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Card, Empty, Spin, Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { formatBatchTiming } from "@/utils/batch";

const { Text } = Typography;

export type BatchCardData = {
  id: string;
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  count: number;
};

/**
 * The premium batch-card grid every admin content screen opens on (D29): Tests,
 * Homework and Study Material. One card per batch — gradient icon tile, timing,
 * a tinted count pill and a hover-lift chevron — tapping a card drills into that
 * batch. Navigation-only: no destructive actions live here.
 */
export function BatchPicker({
  batches,
  loading,
  icon,
  accentFrom,
  accentTo,
  countNoun,
  onSelect,
  empty,
}: {
  batches: BatchCardData[];
  loading: boolean;
  icon: ReactNode;
  /** Gradient endpoints for the icon tile (also tints the count pill). */
  accentFrom: string;
  accentTo: string;
  /** Pluralised label for a batch's item count, e.g. n => `${n} tests`. */
  countNoun: (n: number) => string;
  onSelect: (batchId: string) => void;
  empty: ReactNode;
}) {
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (batches.length === 0) {
    return <Card>{empty ?? <Empty description="No batches yet." />}</Card>;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
      }}
    >
      {batches.map((b) => {
        const timing = formatBatchTiming(b.start_time, b.end_time);
        return (
          <Card
            key={b.id}
            hoverable
            className="tap"
            styles={{ body: { padding: 18 } }}
            style={{ borderRadius: 16 }}
            onClick={() => onSelect(b.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 46,
                  height: 46,
                  flexShrink: 0,
                  borderRadius: 13,
                  fontSize: 21,
                  color: "#fff",
                  background: `linear-gradient(135deg, ${accentFrom} 0%, ${accentTo} 100%)`,
                  boxShadow: `0 10px 22px -12px ${accentTo}`,
                }}
              >
                {icon}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text strong ellipsis style={{ display: "block", fontSize: 16 }}>
                  {b.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  {timing ?? "No timing set"}
                </Text>
              </div>
              <RightOutlined style={{ color: "rgba(148,163,184,0.9)", fontSize: 13 }} />
            </div>

            <div style={{ marginTop: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: accentTo,
                  background: `${accentTo}1a`,
                }}
              >
                {countNoun(b.count)}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

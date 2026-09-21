"use client";

import type { ReactNode } from "react";
import { Breadcrumb, Button, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export type Crumb = { label: string; onClick?: () => void };

/**
 * Header for a drilled-in admin level (D29): a back arrow, a clickable breadcrumb
 * trail (last item is the current level), a title + optional subtitle with an accent
 * icon tile, and an optional right-aligned action slot (e.g. Create / Add subject).
 * Shared by the Tests, Homework and Study-Material drill-downs for one consistent look.
 */
export function DrillHeader({
  crumbs,
  title,
  subtitle,
  icon,
  accentFrom = "#6366f1",
  accentTo = "#4f46e5",
  onBack,
  extra,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  accentFrom?: string;
  accentTo?: string;
  onBack: () => void;
  extra?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={crumbs.map((c) => ({
          title: c.onClick ? (
            <a
              onClick={(e) => {
                e.preventDefault();
                c.onClick?.();
              }}
            >
              {c.label}
            </a>
          ) : (
            c.label
          ),
        }))}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Button
            type="text"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            aria-label="Back"
          />
          {icon ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 13,
                fontSize: 20,
                color: "#fff",
                background: `linear-gradient(135deg, ${accentFrom} 0%, ${accentTo} 100%)`,
                boxShadow: `0 10px 22px -12px ${accentTo}`,
              }}
            >
              {icon}
            </span>
          ) : null}
          <div style={{ minWidth: 0 }}>
            <Title level={3} style={{ margin: 0, lineHeight: 1.2 }} ellipsis>
              {title}
            </Title>
            {subtitle ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {subtitle}
              </Text>
            ) : null}
          </div>
        </div>
        {extra ? <div>{extra}</div> : null}
      </div>
    </div>
  );
}

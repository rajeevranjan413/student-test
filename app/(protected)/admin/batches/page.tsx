"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Spin, Typography } from "antd";
import {
  BookOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  KeyOutlined,
  PlusOutlined,
  RightOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatBatchTiming } from "@/utils/batch";

const { Title, Text } = Typography;

type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  secret_pass: string;
  exam_level?: string | null;
  student_count?: number;
  test_count?: number;
};

const ACCENT_FROM = "#3b82f6";
const ACCENT_TO = "#1d4ed8";

function StatPill({
  icon,
  label,
  tinted,
}: {
  icon: React.ReactNode;
  label: string;
  tinted?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        color: tinted ? ACCENT_TO : "rgba(100,116,139,0.95)",
        background: tinted ? `${ACCENT_TO}1a` : "rgba(148,163,184,0.14)",
      }}
    >
      {icon}
      {label}
    </span>
  );
}

export default function BatchesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/batches");
        if (res.ok) setBatches(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageContainer>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 14,
              fontSize: 22,
              color: "#fff",
              background: `linear-gradient(135deg, ${ACCENT_FROM} 0%, ${ACCENT_TO} 100%)`,
              boxShadow: `0 10px 22px -10px ${ACCENT_TO}`,
            }}
          >
            <BookOutlined />
          </span>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Batches
            </Title>
            <Text type="secondary">Organize your students into batches</Text>
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push("/admin/batches/new")}
        >
          Create Batch
        </Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <Empty description="You haven't created any batches yet.">
            <Button type="primary" onClick={() => router.push("/admin/batches/new")}>
              Create your first batch
            </Button>
          </Empty>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
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
                onClick={() => router.push(`/admin/batches/${b.id}`)}
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
                      background: `linear-gradient(135deg, ${ACCENT_FROM} 0%, ${ACCENT_TO} 100%)`,
                      boxShadow: `0 10px 22px -12px ${ACCENT_TO}`,
                    }}
                  >
                    <BookOutlined />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text strong ellipsis style={{ display: "block", fontSize: 16 }}>
                      {b.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      <ClockCircleOutlined style={{ marginRight: 6 }} />
                      {timing ?? "No timing set"}
                    </Text>
                  </div>
                  <RightOutlined
                    style={{ color: "rgba(148,163,184,0.9)", fontSize: 13 }}
                  />
                </div>

                {b.exam_level ? (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {b.exam_level}
                    </Text>
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <StatPill
                    tinted
                    icon={<TeamOutlined />}
                    label={`${b.student_count ?? 0} student${
                      (b.student_count ?? 0) === 1 ? "" : "s"
                    }`}
                  />
                  <StatPill
                    icon={<FileTextOutlined />}
                    label={`${b.test_count ?? 0} test${
                      (b.test_count ?? 0) === 1 ? "" : "s"
                    }`}
                  />
                  <StatPill icon={<KeyOutlined />} label={b.secret_pass} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

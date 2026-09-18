"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  PlusOutlined,
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
  student_count?: number;
  test_count?: number;
};

type Student = { id: string };

type Test = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  batch_name: string | null;
  created_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  published: "green",
  closed: "red",
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleDateString() : "—";
}

type Tone = { badge: string; shadow: string };
const TONES: Record<"blue" | "violet" | "emerald", Tone> = {
  blue: {
    badge: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    shadow: "0 10px 22px -10px rgba(37, 99, 235, 0.6)",
  },
  violet: {
    badge: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
    shadow: "0 10px 22px -10px rgba(124, 58, 237, 0.6)",
  },
  emerald: {
    badge: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
    shadow: "0 10px 22px -10px rgba(5, 150, 105, 0.6)",
  },
};

/** A premium dashboard metric card: a gradient icon badge, big number, and label. */
function StatCard({
  icon,
  label,
  value,
  suffix,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  tone: keyof typeof TONES;
  onClick: () => void;
}) {
  const t = TONES[tone];
  return (
    <Card hoverable onClick={onClick} styles={{ body: { padding: 20 } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 54,
            height: 54,
            flexShrink: 0,
            borderRadius: 16,
            fontSize: 24,
            color: "#fff",
            background: t.badge,
            boxShadow: t.shadow,
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
            {label}
          </Text>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {value}
            {suffix ? (
              <Text type="secondary" style={{ fontSize: 15, fontWeight: 500 }}>
                {" "}
                {suffix}
              </Text>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AdminHomePage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [b, s, t] = await Promise.all([
          fetch("/api/batches").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/students").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/tests").then((r) => (r.ok ? r.json() : [])),
        ]);
        setBatches(Array.isArray(b) ? b : []);
        setStudents(Array.isArray(s) ? s : []);
        setTests(Array.isArray(t) ? t : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const publishedCount = tests.filter((t) => t.status === "published").length;

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
        <Spin size="large" />
      </div>
    );

  return (
    <PageContainer>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 4,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Overview
          </Title>
          <Text type="secondary">
            Batches, students, and tests across your coaching center.
          </Text>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => router.push("/admin/batches/new")}>
            New batch
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push("/admin/quizzes/new")}
          >
            New test
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} sm={8}>
          <StatCard
            tone="blue"
            icon={<BookOutlined />}
            label="Batches"
            value={batches.length}
            onClick={() => router.push("/admin/batches")}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            tone="violet"
            icon={<TeamOutlined />}
            label="Students"
            value={students.length}
            onClick={() => router.push("/admin/students")}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            tone="emerald"
            icon={<FileTextOutlined />}
            label="Published tests"
            value={publishedCount}
            suffix={`/ ${tests.length}`}
            onClick={() => router.push("/admin/quizzes")}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} xl={12}>
          <Card
            title="Recent batches"
            extra={<Button type="link" onClick={() => router.push("/admin/batches")}>View all</Button>}
          >
            {batches.length === 0 ? (
              <Empty description="No batches yet." />
            ) : (
              <List
                dataSource={batches.slice(0, 5)}
                rowKey={(b) => b.id}
                renderItem={(b) => (
                  <List.Item
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/admin/batches/${b.id}`)}
                    actions={[
                      <Text type="secondary" key="c">
                        {b.student_count ?? 0} students · {b.test_count ?? 0} tests
                      </Text>,
                    ]}
                  >
                    <List.Item.Meta
                      title={b.name}
                      description={formatBatchTiming(b.start_time, b.end_time) ?? undefined}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title="Recent tests"
            extra={<Button type="link" onClick={() => router.push("/admin/quizzes")}>View all</Button>}
          >
            {tests.length === 0 ? (
              <Empty description="No tests yet." />
            ) : (
              <List
                dataSource={tests.slice(0, 5)}
                rowKey={(t) => t.id}
                renderItem={(t) => (
                  <List.Item
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/admin/quizzes/${t.id}`)}
                    actions={[
                      <Tag color={STATUS_COLOR[t.status] ?? "default"} key="s">
                        {t.status}
                      </Tag>,
                    ]}
                  >
                    <List.Item.Meta
                      title={t.title}
                      description={
                        <>
                          {t.batch_name ?? "—"} · {fmt(t.created_at)}
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}

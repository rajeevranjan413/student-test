"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Typography,
  theme,
} from "antd";
import {
  BookOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  MinusCircleFilled,
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

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleDateString() : "—";
}

type Tone = { badge: string; shadow: string; tint: string; ink: string };
const TONES: Record<"blue" | "violet" | "emerald" | "amber" | "rose", Tone> = {
  blue: {
    badge: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    shadow: "0 10px 22px -10px rgba(37, 99, 235, 0.6)",
    tint: "rgba(37, 99, 235, 0.12)",
    ink: "#2563eb",
  },
  violet: {
    badge: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
    shadow: "0 10px 22px -10px rgba(124, 58, 237, 0.6)",
    tint: "rgba(124, 58, 237, 0.12)",
    ink: "#7c3aed",
  },
  emerald: {
    badge: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
    shadow: "0 10px 22px -10px rgba(5, 150, 105, 0.6)",
    tint: "rgba(5, 150, 105, 0.14)",
    ink: "#059669",
  },
  amber: {
    badge: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
    shadow: "0 10px 22px -10px rgba(217, 119, 6, 0.6)",
    tint: "rgba(217, 119, 6, 0.14)",
    ink: "#b45309",
  },
  rose: {
    badge: "linear-gradient(135deg, #fb7185 0%, #e11d48 100%)",
    shadow: "0 10px 22px -10px rgba(225, 29, 72, 0.6)",
    tint: "rgba(225, 29, 72, 0.13)",
    ink: "#e11d48",
  },
};

type StatusMeta = { tone: keyof typeof TONES; label: string; icon: ReactNode };
const TEST_STATUS: Record<Test["status"], StatusMeta> = {
  published: { tone: "emerald", label: "Published", icon: <CheckCircleFilled /> },
  draft: { tone: "amber", label: "Draft", icon: <EditOutlined /> },
  closed: { tone: "rose", label: "Closed", icon: <MinusCircleFilled /> },
};

/** A soft, tinted status pill — reads as premium next to a plain antd Tag. */
function StatusPill({ meta }: { meta: StatusMeta }) {
  const t = TONES[meta.tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        color: t.ink,
        background: t.tint,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 11, display: "inline-flex" }}>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

/** A premium clickable row: gradient icon tile, title + meta, hover lift + chevron. */
function RecentRow({
  tone,
  icon,
  title,
  subtitle,
  right,
  onClick,
  last,
}: {
  tone: keyof typeof TONES;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  right: ReactNode;
  onClick: () => void;
  last: boolean;
}) {
  const { token } = theme.useToken();
  const [hover, setHover] = useState(false);
  const t = TONES[tone];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 12px",
        borderRadius: 14,
        cursor: "pointer",
        outline: "none",
        transition: "background 0.18s ease, transform 0.18s ease",
        background: hover ? token.colorFillTertiary : "transparent",
        transform: hover ? "translateX(3px)" : "none",
        borderBottom:
          last ? "none" : `1px solid ${token.colorSplit}`,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 42,
          height: 42,
          flexShrink: 0,
          borderRadius: 12,
          fontSize: 18,
          color: "#fff",
          background: t.badge,
          boxShadow: hover ? t.shadow : "none",
          transition: "box-shadow 0.18s ease",
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: token.colorText,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 13,
            color: token.colorTextSecondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {right}
        <RightOutlined
          style={{
            fontSize: 12,
            color: token.colorTextTertiary,
            opacity: hover ? 1 : 0.35,
            transform: hover ? "translateX(2px)" : "none",
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }}
        />
      </div>
    </div>
  );
}

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
            styles={{ body: { padding: batches.length === 0 ? 24 : 8 } }}
            extra={
              <Button type="link" onClick={() => router.push("/admin/batches")}>
                View all
              </Button>
            }
          >
            {batches.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No batches yet."
              />
            ) : (
              batches.slice(0, 5).map((b, i, arr) => {
                const timing = formatBatchTiming(b.start_time, b.end_time);
                return (
                  <RecentRow
                    key={b.id}
                    tone="blue"
                    icon={<BookOutlined />}
                    title={b.name}
                    last={i === arr.length - 1}
                    onClick={() => router.push(`/admin/batches/${b.id}`)}
                    subtitle={
                      <>
                        <CalendarOutlined style={{ fontSize: 12 }} />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {timing ?? "No schedule set"}
                        </span>
                      </>
                    }
                    right={
                      <Space size={6}>
                        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                          <TeamOutlined style={{ marginRight: 4 }} />
                          {b.student_count ?? 0}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                          <FileTextOutlined style={{ marginRight: 4 }} />
                          {b.test_count ?? 0}
                        </Text>
                      </Space>
                    }
                  />
                );
              })
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card
            title="Recent tests"
            styles={{ body: { padding: tests.length === 0 ? 24 : 8 } }}
            extra={
              <Button type="link" onClick={() => router.push("/admin/quizzes")}>
                View all
              </Button>
            }
          >
            {tests.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No tests yet."
              />
            ) : (
              tests.slice(0, 5).map((t, i, arr) => {
                const meta = TEST_STATUS[t.status];
                return (
                  <RecentRow
                    key={t.id}
                    tone={meta.tone}
                    icon={<FileTextOutlined />}
                    title={t.title}
                    last={i === arr.length - 1}
                    onClick={() => router.push(`/admin/quizzes/${t.id}`)}
                    subtitle={
                      <>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.batch_name ?? "Unassigned"}
                        </span>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <ClockCircleOutlined style={{ fontSize: 12 }} />
                        <span style={{ whiteSpace: "nowrap" }}>{fmt(t.created_at)}</span>
                      </>
                    }
                    right={<StatusPill meta={meta} />}
                  />
                );
              })
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}

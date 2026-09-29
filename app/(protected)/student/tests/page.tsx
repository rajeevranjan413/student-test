"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { useBatches } from "@/components/providers/BatchProvider";
import {
  itemSignature,
  markSeen,
  snapshotStatus,
  type SeenStatus,
} from "@/utils/whatsNew";
import { NewBadge } from "@/components/student/NewBadge";

const { Title, Text } = Typography;

type TestState = "not_started" | "in_progress" | "submitted" | "missed";
type Phase = "upcoming" | "open" | "closed";

type StudentTestRow = {
  id: string;
  title: string;
  batch_id: string | null;
  batch_name: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  marks_per_question: number;
  negative_marking: number;
  passing_marks: number | null;
  question_count: number;
  phase: Phase;
  state: TestState;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
  is_late: boolean;
  created_at: string | null;
  updated_at: string | null;
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

const STATE_TAG: Record<TestState, { color: string; label: string }> = {
  not_started: { color: "blue", label: "Not started" },
  in_progress: { color: "gold", label: "In progress" },
  submitted: { color: "green", label: "Completed" },
  missed: { color: "red", label: "Closed" },
};

// Per-state two-stop palette for the card's coloured left rail + icon tile, so the
// list reads at a glance (blue to-do → amber in-progress → green done → red closed).
const STATE_ACCENT: Record<TestState, { from: string; to: string }> = {
  not_started: { from: "#3b82f6", to: "#6366f1" },
  in_progress: { from: "#f59e0b", to: "#f97316" },
  submitted: { from: "#10b981", to: "#059669" },
  missed: { from: "#ef4444", to: "#dc2626" },
};

export default function StudentTests() {
  const router = useRouter();
  const { activeBatchId, batches } = useBatches();
  const [rows, setRows] = useState<StudentTestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-test new/updated status vs. what this student last saw (F16). Snapshotted
  // on load, then the section is marked seen so the badge clears next visit.
  const [statusById, setStatusById] = useState<Record<string, SeenStatus>>({});

  // Filter by the header's active batch (null = All batches). Since a stale
  // selection is reconciled to null in BatchProvider, filtering never hides
  // everything by accident.
  const visibleRows = activeBatchId
    ? rows.filter((r) => r.batch_id === activeBatchId)
    : rows;
  const activeBatchName =
    batches.find((b) => b.id === activeBatchId)?.name ?? null;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/student/tests");
        if (!res.ok) {
          setError((await res.json().catch(() => ({}))).error ?? "Failed to load tests.");
          return;
        }
        const data = (await res.json()) as StudentTestRow[];
        const items = data.map((r) => ({ id: r.id, sig: itemSignature(r) }));
        setStatusById(snapshotStatus("tests", items).statusById);
        setRows(data);
        markSeen("tests", items);
      } catch {
        setError("Failed to load tests.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function action(r: StudentTestRow) {
    if (r.state === "submitted")
      return (
        <Button onClick={() => router.push(`/student/tests/${r.id}`)}>
          View result
        </Button>
      );
    if (r.state === "in_progress")
      return (
        <Button type="primary" danger onClick={() => router.push(`/student/tests/${r.id}`)}>
          Resume
        </Button>
      );
    if (r.state === "missed")
      return (
        <Button disabled>Closed</Button>
      );
    // not_started
    if (r.phase === "open")
      return (
        <Button type="primary" onClick={() => router.push(`/student/tests/${r.id}`)}>
          Start test
        </Button>
      );
    return <Button disabled>Opens {fmt(r.scheduled_at)}</Button>;
  }

  if (loading)
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );

  return (
    <PageContainer max={960}>
      <Title level={3} style={{ marginTop: 0 }}>
        My Tests
      </Title>
      <Text type="secondary">
        {activeBatchName
          ? `Scheduled tests for ${activeBatchName}.`
          : "Scheduled tests for the batches you are enrolled in."}
      </Text>

      {error && (
        <Card style={{ marginTop: 24 }}>
          <Text type="danger">{error}</Text>
        </Card>
      )}

      {!error && visibleRows.length === 0 && (
        <Card style={{ marginTop: 24 }}>
          <Empty
            description={
              activeBatchName
                ? `No tests for ${activeBatchName} yet.`
                : "No tests assigned to your batches yet."
            }
          />
        </Card>
      )}

      <Flex vertical gap={16} style={{ marginTop: 24 }}>
        {visibleRows.map((r) => {
          const tag = STATE_TAG[r.state];
          const accent = STATE_ACCENT[r.state];
          const passed =
            r.passing_marks != null && (r.score ?? 0) >= r.passing_marks;
          return (
            <Card
              key={r.id}
              className="stu-rail"
              styles={{ body: { padding: 20, paddingLeft: 24 } }}
              style={{
                ["--a" as string]: accent.from,
                ["--b" as string]: accent.to,
              }}
            >
              <Flex justify="space-between" align="flex-start" gap={16} wrap>
                <Flex gap={14} style={{ minWidth: 240, flex: 1 }}>
                  <span
                    className="stu-tile"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      fontSize: 20,
                      flexShrink: 0,
                      ["--a" as string]: accent.from,
                      ["--b" as string]: accent.to,
                    }}
                  >
                    <FileTextOutlined />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <Flex align="center" gap={8} wrap>
                      <Text strong style={{ fontSize: 16 }}>
                        {r.title}
                      </Text>
                      <NewBadge status={statusById[r.id]} />
                      <Tag color={tag.color}>{tag.label}</Tag>
                      {r.state === "submitted" && r.is_late && <Tag color="volcano">Late</Tag>}
                    </Flex>
                    <Flex gap={16} wrap style={{ marginTop: 8 }}>
                      {r.batch_name && <Text type="secondary">{r.batch_name}</Text>}
                      <Text type="secondary">
                        <CalendarOutlined /> {fmt(r.scheduled_at)}
                      </Text>
                      <Text type="secondary">
                        <ClockCircleOutlined /> {r.duration_minutes} min
                      </Text>
                      <Text type="secondary">
                        <FileTextOutlined /> {r.question_count} questions
                      </Text>
                    </Flex>
                  </div>
                </Flex>

                <Flex align="center" gap={20}>
                  {r.state === "submitted" && r.max_score != null && (
                    <Badge.Ribbon
                      text={r.passing_marks != null ? (passed ? "Pass" : "Fail") : ""}
                      color={passed ? "green" : "red"}
                      style={{ display: r.passing_marks != null ? undefined : "none" }}
                    >
                      <div style={{ textAlign: "center", padding: "0 8px" }}>
                        <div
                          className="stu-gradient-text"
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            lineHeight: 1.1,
                            letterSpacing: "-0.02em",
                            ["--a" as string]: passed ? "#10b981" : "#f59e0b",
                            ["--b" as string]: passed ? "#059669" : "#ef4444",
                          }}
                        >
                          {r.score ?? 0}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          out of {r.max_score}
                        </Text>
                      </div>
                    </Badge.Ribbon>
                  )}
                  {action(r)}
                </Flex>
              </Flex>
            </Card>
          );
        })}
      </Flex>
    </PageContainer>
  );
}

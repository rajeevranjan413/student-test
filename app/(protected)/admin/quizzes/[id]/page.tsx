"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Row,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { ResponsiveTable } from "@/components/layout/ResponsiveTable";

const { Title, Text } = Typography;

type Outcome =
  | "on_time"
  | "late"
  | "in_progress"
  | "expired"
  | "missed"
  | "pending";

type ResultRow = {
  student_id: string;
  name: string;
  outcome: Outcome;
  started_at: string | null;
  submitted_at: string | null;
  is_late: boolean;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
  percent: number | null;
  passed: boolean | null;
};

type ResultsPayload = {
  test: {
    id: string;
    title: string;
    exam_level: string | null;
    batch_name: string | null;
    scheduled_at: string | null;
    duration_minutes: number;
    total_questions: number | null;
    marks_per_question: number;
    negative_marking: number;
    passing_marks: number | null;
    status: string;
    question_count: number;
    phase: "upcoming" | "open" | "closed";
    opens_at: string | null;
    due_at: string | null;
    closes_at: string | null;
  };
  summary: {
    enrolled: number;
    on_time: number;
    late: number;
    in_progress: number;
    expired: number;
    missed: number;
    pending: number;
    submitted: number;
    average_score: number | null;
    average_percent: number | null;
  };
  rows: ResultRow[];
};

const OUTCOME_TAG: Record<Outcome, { color: string; label: string }> = {
  on_time: { color: "green", label: "On time" },
  late: { color: "volcano", label: "Late" },
  in_progress: { color: "gold", label: "In progress" },
  expired: { color: "orange", label: "Not submitted" },
  missed: { color: "red", label: "Missed" },
  pending: { color: "default", label: "Not started" },
};

const PHASE_TAG: Record<string, { color: string; label: string }> = {
  upcoming: { color: "blue", label: "Upcoming" },
  open: { color: "green", label: "Open" },
  closed: { color: "default", label: "Closed" },
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

export default function TestResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tests/${id}/results`);
        if (!res.ok) {
          setError(
            (await res.json().catch(() => ({}))).error ?? "Failed to load results."
          );
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load results.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const columns: ColumnsType<ResultRow> = [
    {
      title: "Student",
      dataIndex: "name",
      key: "name",
      render: (n: string) => <Text strong>{n}</Text>,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Status",
      dataIndex: "outcome",
      key: "outcome",
      filters: (Object.keys(OUTCOME_TAG) as Outcome[]).map((o) => ({
        text: OUTCOME_TAG[o].label,
        value: o,
      })),
      onFilter: (v, r) => r.outcome === v,
      render: (o: Outcome) => {
        const t = OUTCOME_TAG[o];
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: "Started",
      dataIndex: "started_at",
      key: "started_at",
      render: fmt,
      sorter: (a, b) =>
        (a.started_at ? Date.parse(a.started_at) : 0) -
        (b.started_at ? Date.parse(b.started_at) : 0),
    },
    {
      title: "Submitted",
      dataIndex: "submitted_at",
      key: "submitted_at",
      render: fmt,
      sorter: (a, b) =>
        (a.submitted_at ? Date.parse(a.submitted_at) : 0) -
        (b.submitted_at ? Date.parse(b.submitted_at) : 0),
    },
    {
      title: "Score",
      key: "score",
      align: "right",
      render: (_, r) =>
        r.score == null || r.max_score == null ? (
          <Text type="secondary">—</Text>
        ) : (
          <span>
            {r.score} / {r.max_score}
            {r.percent != null && (
              <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                ({r.percent}%)
              </Text>
            )}
          </span>
        ),
      sorter: (a, b) => (a.score ?? -1) - (b.score ?? -1),
    },
    {
      title: "Result",
      key: "passed",
      render: (_, r) =>
        r.passed == null ? (
          <Text type="secondary">—</Text>
        ) : (
          <Tag color={r.passed ? "green" : "red"}>{r.passed ? "Pass" : "Fail"}</Tag>
        ),
    },
  ];

  if (loading)
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );

  if (error || !data)
    return (
      <PageContainer>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/admin/quizzes")}
          style={{ marginBottom: 16 }}
        >
          Back to tests
        </Button>
        <Card>
          <Empty description={error ?? "Results not available."} />
        </Card>
      </PageContainer>
    );

  const { test, summary, rows } = data;
  const phaseTag = PHASE_TAG[test.phase] ?? PHASE_TAG.upcoming;

  return (
    <PageContainer>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push("/admin/quizzes")}
        style={{ marginBottom: 8, paddingLeft: 0 }}
      >
        Tests
      </Button>

      <Flex align="center" gap={8} wrap style={{ marginBottom: 4 }}>
        <Title level={3} style={{ margin: 0 }}>
          {test.title}
        </Title>
        <Tag color={phaseTag.color}>{phaseTag.label}</Tag>
        {test.exam_level && <Tag>{test.exam_level}</Tag>}
      </Flex>
      <Text type="secondary">
        {test.batch_name ?? "—"} · Scheduled {fmt(test.scheduled_at)} ·{" "}
        {test.duration_minutes} min · {test.question_count} questions
        {test.closes_at && <> · Hard close {fmt(test.closes_at)}</>}
      </Text>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="Enrolled" value={summary.enrolled} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="On time"
              value={summary.on_time}
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Late"
              value={summary.late}
              valueStyle={{ color: "#d4380d" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Missed"
              value={summary.missed}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="In progress"
              value={summary.in_progress + summary.expired + summary.pending}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Avg score"
              value={summary.average_score ?? "—"}
              suffix={
                summary.average_percent != null
                  ? `(${summary.average_percent}%)`
                  : undefined
              }
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }}>
        <ResponsiveTable
          rowKey="student_id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description="No students enrolled in this test's batch yet." />
            ),
          }}
        />
      </Card>
    </PageContainer>
  );
}

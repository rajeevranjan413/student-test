"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { ResponsiveTable } from "@/components/layout/ResponsiveTable";
import { formatBatchTiming } from "@/utils/batch";

const { Title, Text } = Typography;

type Outcome =
  | "on_time"
  | "late"
  | "in_progress"
  | "expired"
  | "missed"
  | "pending";

type HistoryRow = {
  test_id: string;
  title: string;
  batch_name: string | null;
  scheduled_at: string | null;
  outcome: Outcome;
  started_at: string | null;
  submitted_at: string | null;
  is_late: boolean;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
};

type Payload = {
  student: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
  };
  batches: { id: string; name: string | null; start_time: string | null; end_time: string | null }[];
  history: HistoryRow[];
  summary: {
    assigned: number;
    submitted: number;
    on_time: number;
    late: number;
    missed: number;
    average_percent: number | null;
  };
};

const OUTCOME_TAG: Record<Outcome, { color: string; label: string }> = {
  on_time: { color: "green", label: "On time" },
  late: { color: "volcano", label: "Late" },
  in_progress: { color: "gold", label: "In progress" },
  expired: { color: "orange", label: "Not submitted" },
  missed: { color: "red", label: "Missed" },
  pending: { color: "default", label: "Not started" },
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/students/${id}`);
        if (!res.ok) {
          setError(
            (await res.json().catch(() => ({}))).error ?? "Failed to load student."
          );
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load student.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const columns: ColumnsType<HistoryRow> = [
    {
      title: "Test",
      dataIndex: "title",
      key: "title",
      render: (t: string, r) => (
        <div>
          <Text strong>{t}</Text>
          {r.batch_name && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.batch_name}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Scheduled",
      dataIndex: "scheduled_at",
      key: "scheduled_at",
      render: fmt,
      sorter: (a, b) =>
        (a.scheduled_at ? Date.parse(a.scheduled_at) : 0) -
        (b.scheduled_at ? Date.parse(b.scheduled_at) : 0),
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
      title: "Submitted",
      dataIndex: "submitted_at",
      key: "submitted_at",
      render: fmt,
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
          onClick={() => router.push("/admin/students")}
          style={{ marginBottom: 16 }}
        >
          Back to students
        </Button>
        <Card>
          <Empty description={error ?? "Student not available."} />
        </Card>
      </PageContainer>
    );

  const { student, batches, history, summary } = data;

  return (
    <PageContainer>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push("/admin/students")}
        style={{ marginBottom: 8, paddingLeft: 0 }}
      >
        Students
      </Button>

      <Title level={3} style={{ margin: "0 0 16px" }}>
        {student.full_name ?? "Student"}
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card size="small" title="Profile">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Email">
                {student.email ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {student.phone ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Joined">
                {fmt(student.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="Batches">
                {batches.length === 0 ? (
                  <Text type="secondary">Not enrolled in any batch.</Text>
                ) : (
                  <Space size={[4, 4]} wrap>
                    {batches.map((b) => (
                      <Tag key={b.id}>
                        {b.name ?? "—"}
                        {formatBatchTiming(b.start_time, b.end_time)
                          ? ` · ${formatBatchTiming(b.start_time, b.end_time)}`
                          : ""}
                      </Tag>
                    ))}
                  </Space>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Row gutter={[16, 16]}>
            <Col xs={12}>
              <Card size="small">
                <Statistic title="Assigned" value={summary.assigned} />
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small">
                <Statistic
                  title="Submitted"
                  value={summary.submitted}
                  valueStyle={{ color: "#3f8600" }}
                />
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small">
                <Statistic
                  title="Late"
                  value={summary.late}
                  valueStyle={{ color: "#d4380d" }}
                />
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small">
                <Statistic
                  title="Missed"
                  value={summary.missed}
                  valueStyle={{ color: "#cf1322" }}
                />
              </Card>
            </Col>
            <Col xs={24}>
              <Card size="small">
                <Statistic
                  title="Average"
                  value={summary.average_percent ?? "—"}
                  suffix={summary.average_percent != null ? "%" : undefined}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card title="Test history" style={{ marginTop: 24 }}>
        <ResponsiveTable
          rowKey="test_id"
          columns={columns}
          dataSource={history}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: <Empty description="No tests assigned to this student's batches yet." />,
          }}
        />
      </Card>
    </PageContainer>
  );
}

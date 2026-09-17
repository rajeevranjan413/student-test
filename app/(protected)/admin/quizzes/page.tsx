"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Tag, Typography, Empty, Space, Popconfirm } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { ResponsiveTable } from "@/components/layout/ResponsiveTable";

const { Title, Text } = Typography;

type TestRow = {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number;
  total_questions: number | null;
  status: "draft" | "published" | "closed";
  batch_name: string | null;
  question_count: number;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  published: "green",
  closed: "red",
};

export default function QuizzesPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tests");
        if (res.ok) setRows(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (r: TestRow) => {
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/tests/${r.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete test");
      setRows((prev) => prev.filter((row) => row.id !== r.id));
      message.success(
        data.archived
          ? "Test archived — it had attempts, so results were kept."
          : "Test deleted."
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete test");
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnsType<TestRow> = [
    {
      title: "Test",
      dataIndex: "title",
      key: "title",
      render: (t: string) => (
        <div>
          <Text strong>{t}</Text>
        </div>
      ),
    },
    { title: "Batch", dataIndex: "batch_name", key: "batch_name", render: (b) => b ?? "—" },
    {
      title: "Scheduled",
      dataIndex: "scheduled_at",
      key: "scheduled_at",
      render: (s: string | null) => (s ? new Date(s).toLocaleString() : "—"),
    },
    {
      title: "Duration",
      dataIndex: "duration_minutes",
      key: "duration_minutes",
      render: (d: number) => `${d} min`,
    },
    {
      title: "Questions",
      key: "questions",
      render: (_, r) => `${r.question_count}${r.total_questions ? ` / ${r.total_questions}` : ""}`,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={STATUS_COLOR[s] ?? "default"}>{s}</Tag>,
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, r) => (
        <Space size={0} wrap>
          <Button
            type="link"
            style={{ paddingRight: 0 }}
            onClick={() => router.push(`/admin/quizzes/${r.id}`)}
          >
            Results
          </Button>
          <Button type="link" onClick={() => router.push(`/admin/quizzes/${r.id}/edit`)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this test?"
            description="Tests with student attempts are archived (results kept); others are permanently removed."
            okText="Delete"
            okButtonProps={{ danger: true, loading: deletingId === r.id }}
            onConfirm={() => handleDelete(r)}
          >
            <Button type="link" danger style={{ paddingRight: 0 }}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Tests
          </Title>
          <Text type="secondary">AI-generated, scheduled tests for your batches</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push("/admin/quizzes/new")}
        >
          Create Test
        </Button>
      </div>

      <Card>
        <ResponsiveTable
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description="No tests yet">
                <Space direction="vertical">
                  <Text type="secondary">
                    Turn a photo of notes into a scheduled test.
                  </Text>
                  <Button type="primary" onClick={() => router.push("/admin/quizzes/new")}>
                    Create your first test
                  </Button>
                </Space>
              </Empty>
            ),
          }}
        />
      </Card>
    </PageContainer>
  );
}

"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  EditOutlined,
  UserAddOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

type EnrolledStudent = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type AvailableStudent = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type BatchTest = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed" | null;
  scheduled_at: string | null;
};

type Payload = {
  id: string;
  name: string | null;
  course: string | null;
  secret_pass: string | null;
  description: string | null;
  exam_level: string | null;
  status: string | null;
  students: EnrolledStudent[];
  available_students: AvailableStudent[];
  tests: BatchTest[];
};

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  published: "green",
  closed: "red",
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

export default function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addId, setAddId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/batches/${id}`);
      if (!res.ok) {
        setError(
          (await res.json().catch(() => ({}))).error ?? "Failed to load batch."
        );
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError("Failed to load batch.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const enroll = async () => {
    if (!addId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/batches/${id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: addId }),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      message.success("Student enrolled.");
      setAddId(undefined);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to enroll student.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (studentId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/batches/${id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      message.success("Student removed.");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to remove student.");
    } finally {
      setBusy(false);
    }
  };

  const studentColumns: ColumnsType<EnrolledStudent> = [
    {
      title: "Name",
      dataIndex: "full_name",
      key: "full_name",
      render: (n: string | null, r) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => router.push(`/admin/students/${r.id}`)}
        >
          {n ?? "—"}
        </Button>
      ),
    },
    { title: "Email", dataIndex: "email", key: "email", render: (e) => e ?? "—" },
    { title: "Phone", dataIndex: "phone", key: "phone", render: (p) => p ?? "—" },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, r) => (
        <Popconfirm
          title="Remove from batch?"
          description="This un-enrolls the student. Their test history is kept."
          okText="Remove"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove(r.id)}
        >
          <Button danger type="text" size="small" disabled={busy}>
            Remove
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const testColumns: ColumnsType<BatchTest> = [
    {
      title: "Test",
      dataIndex: "title",
      key: "title",
      render: (t: string) => <Text strong>{t}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string | null) => (
        <Tag color={STATUS_COLOR[s ?? ""] ?? "default"}>{s ?? "—"}</Tag>
      ),
    },
    {
      title: "Scheduled",
      dataIndex: "scheduled_at",
      key: "scheduled_at",
      render: fmt,
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, r) => (
        <Button
          type="link"
          style={{ paddingRight: 0 }}
          onClick={() => router.push(`/admin/quizzes/${r.id}`)}
        >
          View results
        </Button>
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
      <div style={{ padding: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/admin/batches")}
          style={{ marginBottom: 16 }}
        >
          Back to batches
        </Button>
        <Card>
          <Empty description={error ?? "Batch not available."} />
        </Card>
      </div>
    );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push("/admin/batches")}
        style={{ marginBottom: 8, paddingLeft: 0 }}
      >
        Batches
      </Button>

      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {data.name ?? "Batch"}
        </Title>
        <Button
          icon={<EditOutlined />}
          onClick={() => router.push(`/admin/batches/${id}/edit`)}
        >
          Edit batch
        </Button>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card size="small" title="Details">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Course">
                {data.course ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Exam level">
                {data.exam_level ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Secret pass">
                <Tag>{data.secret_pass ?? "—"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {data.status ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Description">
                {data.description ?? "—"}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Row gutter={[16, 16]}>
            <Col xs={12}>
              <Card size="small">
                <Statistic title="Students" value={data.students.length} />
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small">
                <Statistic title="Tests" value={data.tests.length} />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      <Card
        title="Enrolled students"
        style={{ marginTop: 24 }}
        extra={
          <Space>
            <Select
              showSearch
              allowClear
              placeholder="Add a student…"
              style={{ minWidth: 240 }}
              value={addId}
              onChange={setAddId}
              optionFilterProp="label"
              options={data.available_students.map((s) => ({
                value: s.id,
                label: s.full_name ?? s.email ?? s.id,
              }))}
              notFoundContent="No unenrolled students"
            />
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={enroll}
              disabled={!addId || busy}
            >
              Add
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={studentColumns}
          dataSource={data.students}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: <Empty description="No students enrolled yet." />,
          }}
        />
      </Card>

      <Card title="Tests" style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          columns={testColumns}
          dataSource={data.tests}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: <Empty description="No tests created for this batch yet." />,
          }}
        />
      </Card>
    </div>
  );
}

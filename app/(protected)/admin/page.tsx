"use client";

import { useEffect, useState } from "react";
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
  Statistic,
  Tag,
  Typography,
} from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  PlusOutlined,
  TeamOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

type Batch = {
  id: string;
  name: string;
  course: string | null;
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
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
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
          <Card size="small" hoverable onClick={() => router.push("/admin/batches")}>
            <Statistic
              title="Batches"
              value={batches.length}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" hoverable onClick={() => router.push("/admin/students")}>
            <Statistic
              title="Students"
              value={students.length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" hoverable onClick={() => router.push("/admin/quizzes")}>
            <Statistic
              title="Published tests"
              value={publishedCount}
              suffix={`/ ${tests.length}`}
              prefix={<FileTextOutlined />}
            />
          </Card>
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
                      description={b.course ?? undefined}
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
    </div>
  );
}

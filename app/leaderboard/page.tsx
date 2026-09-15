"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  Empty,
  Flex,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { TrophyOutlined } from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";

const { Title, Text } = Typography;

type Row = {
  rank: number;
  student_id: string;
  full_name: string;
  points: number;
  tests_taken: number;
  accuracy: number | null;
};

type Batch = { id: string; name: string; course: string };

const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batch, setBatch] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Batch options for the filter (public endpoint).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/batches");
        if (res.ok) setBatches(await res.json());
      } catch {
        /* filter is optional; ignore */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const url = batch
          ? `/api/public/leaderboard?batch=${encodeURIComponent(batch)}`
          : "/api/public/leaderboard";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setRows(data.rows ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [batch]);

  const columns: ColumnsType<Row> = [
    {
      title: "Rank",
      dataIndex: "rank",
      key: "rank",
      width: 90,
      render: (r: number) => (
        <span style={{ fontWeight: 600 }}>
          {r <= 3 ? <span style={{ marginRight: 6 }}>{MEDAL[r - 1]}</span> : null}
          {r}
        </span>
      ),
    },
    {
      title: "Student",
      dataIndex: "full_name",
      key: "full_name",
      render: (n: string, r) => (
        <Text strong={r.rank <= 3}>{n}</Text>
      ),
    },
    {
      title: "Points",
      dataIndex: "points",
      key: "points",
      align: "right",
      render: (p: number) => <Tag color="blue">{p}</Tag>,
    },
    {
      title: "Tests",
      dataIndex: "tests_taken",
      key: "tests_taken",
      align: "right",
    },
    {
      title: "Accuracy",
      dataIndex: "accuracy",
      key: "accuracy",
      align: "right",
      render: (a: number | null) => (a == null ? "—" : `${a}%`),
    },
  ];

  return (
    <PageContainer max={880}>
      <Flex justify="space-between" align="center" wrap="wrap" style={{ marginBottom: 8, gap: 12 }}>
        <Title level={2} style={{ margin: 0 }}>
          <TrophyOutlined style={{ marginRight: 10, color: "#faad14" }} />
          Leaderboard
        </Title>
        <Space>
          <Select
            allowClear
            placeholder="All batches"
            style={{ minWidth: 220 }}
            value={batch}
            onChange={setBatch}
            options={batches.map((b) => ({
              value: b.id,
              label: b.course ? `${b.name} · ${b.course}` : b.name,
            }))}
          />
          <Link href="/">← Home</Link>
        </Space>
      </Flex>
      <Text type="secondary">
        Ranked by total points across completed tests, then accuracy.
      </Text>

      <Card style={{ marginTop: 16 }}>
        <Table
          rowKey="student_id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description="No results yet — the leaderboard fills up as students complete tests." />
            ),
          }}
        />
      </Card>
    </PageContainer>
  );
}

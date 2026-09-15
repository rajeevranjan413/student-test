"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

type Batch = { id: string; name: string | null };

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  batches: Batch[];
  tests_taken: number;
  last_activity: string | null;
  created_at: string | null;
};

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

export default function StudentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/students");
        if (!res.ok) {
          setError(
            (await res.json().catch(() => ({}))).error ?? "Failed to load students."
          );
          return;
        }
        setRows(await res.json());
      } catch {
        setError("Failed to load students.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const batchOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows)
      for (const b of r.batches) if (b.id) seen.set(b.id, b.name ?? "—");
    return [...seen.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (batchFilter && !r.batches.some((b) => b.id === batchFilter)) return false;
      if (!q) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, batchFilter]);

  const columns: ColumnsType<StudentRow> = [
    {
      title: "Name",
      dataIndex: "full_name",
      key: "full_name",
      render: (n: string | null) => <Text strong>{n ?? "Student"}</Text>,
      sorter: (a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    },
    {
      title: "Contact",
      key: "contact",
      render: (_, r) => (
        <div>
          <div>{r.email ?? "—"}</div>
          {r.phone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.phone}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Batches",
      key: "batches",
      render: (_, r) =>
        r.batches.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={[4, 4]} wrap>
            {r.batches.map((b) => (
              <Tag key={b.id}>{b.name ?? "—"}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: "Tests taken",
      dataIndex: "tests_taken",
      key: "tests_taken",
      align: "right",
      sorter: (a, b) => a.tests_taken - b.tests_taken,
    },
    {
      title: "Last activity",
      dataIndex: "last_activity",
      key: "last_activity",
      render: fmt,
      sorter: (a, b) =>
        (a.last_activity ? Date.parse(a.last_activity) : 0) -
        (b.last_activity ? Date.parse(b.last_activity) : 0),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Title level={3} style={{ marginTop: 0 }}>
        Students
      </Title>
      <Text type="secondary">Everyone enrolled across your batches.</Text>

      <Flex gap={12} wrap style={{ margin: "20px 0" }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select
          allowClear
          placeholder="Filter by batch"
          options={batchOptions}
          value={batchFilter}
          onChange={setBatchFilter}
          style={{ minWidth: 200 }}
        />
      </Flex>

      {error ? (
        <Card>
          <Text type="danger">{error}</Text>
        </Card>
      ) : (
        <Card>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={filtered}
            onRow={(r) => ({
              onClick: () => router.push(`/admin/students/${r.id}`),
              style: { cursor: "pointer" },
            })}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: <Empty description="No students found." /> }}
          />
        </Card>
      )}
    </div>
  );
}

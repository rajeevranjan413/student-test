"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Input,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import type { MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  MoreOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { ResponsiveTable } from "@/components/layout/ResponsiveTable";
import { BatchPicker } from "@/components/admin/BatchPicker";
import { DrillHeader } from "@/components/admin/DrillHeader";
import { useDrillStack } from "@/components/admin/useDrillStack";

const { Title, Text } = Typography;

const ACCENT_FROM = "#a78bfa";
const ACCENT_TO = "#7c3aed";

type Batch = {
  id: string;
  name: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  batches: Batch[];
  tests_taken: number;
  last_activity: string | null;
  created_at: string | null;
  active: boolean;
};

type Tab = "all" | "batches";
type View = { mode: "grid" } | { mode: "batch"; batchId: string; batchName: string };

function fmt(dt: string | null) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

export default function StudentsPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Batch-wise drill (grid → a batch's students), mirroring the D29 drill pattern.
  const { current, push, back, jumpTo } = useDrillStack<View>({ mode: "grid" });

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

  // One card per batch a student is enrolled in, with its live student count.
  const batchCards = useMemo(() => {
    const map = new Map<string, { batch: Batch; count: number }>();
    for (const r of rows)
      for (const b of r.batches) {
        if (!b.id) continue;
        const entry = map.get(b.id) ?? { batch: b, count: 0 };
        entry.count += 1;
        map.set(b.id, entry);
      }
    return [...map.values()]
      .map(({ batch, count }) => ({
        id: batch.id,
        name: batch.name ?? "Batch",
        start_time: batch.start_time ?? null,
        end_time: batch.end_time ?? null,
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Rows for whichever list is showing: the All-students filter, or a batch drill.
  const listRows = useMemo(() => {
    if (tab === "batches") {
      if (current.mode !== "batch") return [];
      return rows.filter((r) => r.batches.some((b) => b.id === current.batchId));
    }
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
  }, [rows, tab, current, search, batchFilter]);

  const setActive = useCallback(
    async (student: StudentRow, active: boolean) => {
      setBusyId(student.id);
      try {
        const res = await fetch(`/api/students/${student.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        });
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => ({}))).error ?? "Update failed"
          );
        setRows((prev) =>
          prev.map((r) => (r.id === student.id ? { ...r, active } : r))
        );
        message.success(
          active
            ? `${student.full_name ?? "Student"} activated.`
            : `${student.full_name ?? "Student"} deactivated.`
        );
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Update failed");
      } finally {
        setBusyId(null);
      }
    },
    [message]
  );

  const remove = useCallback(
    async (student: StudentRow) => {
      setBusyId(student.id);
      try {
        const res = await fetch(`/api/students/${student.id}`, { method: "DELETE" });
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => ({}))).error ?? "Delete failed"
          );
        setRows((prev) => prev.filter((r) => r.id !== student.id));
        message.success(`${student.full_name ?? "Student"} deleted.`);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setBusyId(null);
      }
    },
    [message]
  );

  const confirmRemove = useCallback(
    (student: StudentRow) => {
      modal.confirm({
        title: `Delete ${student.full_name ?? "this student"}?`,
        icon: <DeleteOutlined style={{ color: "#ff4d4f" }} />,
        content:
          "This permanently removes the account and all its enrollments and history. This cannot be undone.",
        okText: "Delete",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
        onOk: () => remove(student),
      });
    },
    [modal, remove]
  );

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
      title: "Status",
      dataIndex: "active",
      key: "active",
      render: (active: boolean) =>
        active ? (
          <Tag color="green">Active</Tag>
        ) : (
          <Tag color="red">Inactive</Tag>
        ),
      sorter: (a, b) => Number(a.active) - Number(b.active),
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
    {
      title: "Actions",
      key: "actions",
      align: "right",
      render: (_, r) => {
        const items: MenuProps["items"] = [
          r.active
            ? { key: "deactivate", icon: <StopOutlined />, label: "Deactivate" }
            : { key: "activate", icon: <CheckCircleOutlined />, label: "Activate" },
          { type: "divider" },
          { key: "delete", icon: <DeleteOutlined />, danger: true, label: "Delete" },
        ];
        return (
          // Stop row-click navigation when interacting with the actions menu.
          <span onClick={(e) => e.stopPropagation()}>
            <Dropdown
              trigger={["click"]}
              menu={{
                items,
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  if (key === "activate") setActive(r, true);
                  else if (key === "deactivate") setActive(r, false);
                  else if (key === "delete") confirmRemove(r);
                },
              }}
            >
              <Button
                type="text"
                icon={<MoreOutlined />}
                loading={busyId === r.id}
                aria-label="Student actions"
              />
            </Dropdown>
          </span>
        );
      },
    },
  ];

  const table = (
    <Card>
      <ResponsiveTable
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={listRows}
        scroll={{ x: "max-content" }}
        onRow={(r) => ({
          onClick: () => router.push(`/admin/students/${r.id}`),
          style: { cursor: "pointer" },
        })}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="No students found." /> }}
      />
    </Card>
  );

  return (
    <PageContainer>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 14,
            fontSize: 22,
            color: "#fff",
            background: `linear-gradient(135deg, ${ACCENT_FROM} 0%, ${ACCENT_TO} 100%)`,
            boxShadow: `0 10px 22px -10px ${ACCENT_TO}99`,
          }}
        >
          <TeamOutlined />
        </span>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Students
          </Title>
          <Text type="secondary">Everyone enrolled across your batches.</Text>
        </div>
      </div>

      <div style={{ margin: "20px 0" }}>
        <Segmented
          value={tab}
          onChange={(v) => {
            const next = v as Tab;
            setTab(next);
            // Land on the batch grid each time the Batch-wise tab is entered.
            if (next === "batches") jumpTo(0);
          }}
          options={[
            { label: "All students", value: "all" },
            { label: "Batch-wise", value: "batches" },
          ]}
        />
      </div>

      {error ? (
        <Card>
          <Text type="danger">{error}</Text>
        </Card>
      ) : tab === "all" ? (
        <>
          <Flex gap={12} wrap style={{ marginBottom: 20 }}>
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
          {table}
        </>
      ) : current.mode === "grid" ? (
        loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <BatchPicker
            batches={batchCards}
            loading={false}
            icon={<TeamOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            countNoun={(n) => `${n} student${n === 1 ? "" : "s"}`}
            onSelect={(batchId) => {
              const b = batchCards.find((x) => x.id === batchId);
              push({ mode: "batch", batchId, batchName: b?.name ?? "Batch" });
            }}
            empty={
              <Empty description="No students are enrolled in any batch yet." />
            }
          />
        )
      ) : (
        <>
          <DrillHeader
            crumbs={[{ label: "All batches", onClick: back }, { label: current.batchName }]}
            title={current.batchName}
            subtitle={`${listRows.length} student${listRows.length === 1 ? "" : "s"}`}
            icon={<TeamOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            onBack={back}
          />
          {table}
        </>
      )}
    </PageContainer>
  );
}

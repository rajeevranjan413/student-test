"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  List,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatFileSize, isImageMime } from "@/utils/studyMaterial";
import type { HomeworkListItem } from "@/utils/homework";

const { Title, Text } = Typography;

type BatchOption = { id: string; name: string };

/**
 * Admin Homework (F14): list every homework the teacher created (MCQ or file),
 * filterable by batch, with a Create action and per-row delete. Create lives on a
 * dedicated two-tab screen (`/admin/homework/new`).
 */
export default function AdminHomeworkPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [items, setItems] = useState<HomeworkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async (batch?: string) => {
    try {
      const q = batch ? `?batch=${encodeURIComponent(batch)}` : "";
      const res = await fetch(`/api/homework${q}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(filterBatch);
  }, [loadData, filterBatch]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/batches");
      if (res.ok) {
        const data = await res.json();
        setBatches(
          (data as { id: string; name: string }[]).map((b) => ({
            id: b.id,
            name: b.name,
          }))
        );
      }
    })();
  }, []);

  const openFile = async (id: string, mode: "view" | "download") => {
    try {
      const res = await fetch(`/api/homework/${id}/download?mode=${mode}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleDelete = async (h: HomeworkListItem) => {
    setBusyId(h.id);
    try {
      const res = await fetch(`/api/homework/${h.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setItems((prev) => prev.filter((x) => x.id !== h.id));
      message.success(data.archived ? "Homework archived." : "Homework deleted.");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

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
            Homework
          </Title>
          <Text type="secondary">
            Assign MCQ practice or share a PDF/image for a batch to complete.
          </Text>
        </div>
        <Space wrap>
          <Select
            allowClear
            placeholder="All batches"
            style={{ minWidth: 180 }}
            value={filterBatch}
            onChange={(v) => {
              setLoading(true);
              setFilterBatch(v);
            }}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push("/admin/homework/new")}
          >
            Create homework
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <Empty description="No homework yet. Create your first assignment.">
            <Button type="primary" onClick={() => router.push("/admin/homework/new")}>
              Create homework
            </Button>
          </Empty>
        </Card>
      ) : (
        <List
          grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3 }}
          dataSource={items}
          rowKey="id"
          renderItem={(h) => (
            <List.Item>
              <Card
                styles={{ body: { padding: 16 } }}
                actions={
                  h.type === "file"
                    ? [
                        <Button
                          key="view"
                          type="text"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => openFile(h.id, "view")}
                        >
                          View
                        </Button>,
                        <Button
                          key="dl"
                          type="text"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => openFile(h.id, "download")}
                        >
                          Download
                        </Button>,
                        <Popconfirm
                          key="del"
                          title="Delete this homework?"
                          description="If any student has done it, it is archived (history kept) instead."
                          okText="Delete"
                          okButtonProps={{ danger: true, loading: busyId === h.id }}
                          onConfirm={() => handleDelete(h)}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>,
                      ]
                    : [
                        <Popconfirm
                          key="del"
                          title="Delete this homework?"
                          description="If any student has done it, it is archived (history kept) instead."
                          okText="Delete"
                          okButtonProps={{ danger: true, loading: busyId === h.id }}
                          onConfirm={() => handleDelete(h)}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>,
                      ]
                }
              >
                <Flex align="flex-start" gap={12}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: h.type === "mcq" ? "#ede9fe" : "#e0f2fe",
                      color: h.type === "mcq" ? "#7c3aed" : "#0284c7",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    {h.type === "mcq" ? (
                      <SolutionOutlined />
                    ) : isImageMime(h.mime_type) ? (
                      <FileImageOutlined />
                    ) : (
                      <FilePdfOutlined />
                    )}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text strong ellipsis style={{ display: "block", fontSize: 15 }}>
                      {h.title}
                    </Text>
                    <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                      {h.batch_name ? <Tag>{h.batch_name}</Tag> : null}
                      <Tag color={h.type === "mcq" ? "purple" : "blue"}>
                        {h.type === "mcq" ? "MCQ" : "PDF / Image"}
                      </Tag>
                      <Tag color={h.is_published ? "green" : "default"}>
                        {h.is_published ? "Published" : "Draft"}
                      </Tag>
                    </Space>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {h.type === "mcq"
                          ? `${h.question_count} question${h.question_count === 1 ? "" : "s"}`
                          : `${h.file_name ?? "file"} · ${formatFileSize(h.file_size)}`}
                        {h.due_at
                          ? ` · Due ${new Date(h.due_at).toLocaleString()}`
                          : ""}
                      </Text>
                    </div>
                    {h.description ? (
                      <Text
                        type="secondary"
                        ellipsis
                        style={{ display: "block", fontSize: 12, marginTop: 4 }}
                      >
                        {h.description}
                      </Text>
                    ) : null}
                  </div>
                </Flex>
              </Card>
            </List.Item>
          )}
        />
      )}
    </PageContainer>
  );
}

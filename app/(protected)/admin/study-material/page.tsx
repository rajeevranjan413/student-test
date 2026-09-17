"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import {
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { ResponsiveTable } from "@/components/layout/ResponsiveTable";
import {
  ACCEPTED_MIME,
  MAX_FILE_BYTES,
  formatFileSize,
  type StudyMaterial,
} from "@/utils/studyMaterial";

const { Title, Text } = Typography;

type BatchOption = { id: string; name: string };

/**
 * Admin Study Material (F13): a teacher uploads PDF "notes" (title + description)
 * for a batch; every enrolled student can view/download them. Upload goes through
 * `POST /api/study-materials` (multipart); files live in a private bucket and are
 * only ever reached via server-minted signed URLs.
 */
export default function AdminStudyMaterialPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<StudyMaterial[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState<string | undefined>();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Note: loading is toggled *false* only after the awaited fetch — never set
  // synchronously here — so calling this from an effect doesn't trip
  // react-hooks/set-state-in-effect. The spinner on filter change is driven from
  // the Select's onChange handler (an event handler, where setState is fine).
  const loadRows = useCallback(async (batch?: string) => {
    try {
      const url = batch
        ? `/api/study-materials?batch=${encodeURIComponent(batch)}`
        : "/api/study-materials";
      const res = await fetch(url);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows(filterBatch);
  }, [loadRows, filterBatch]);

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
      const res = await fetch(
        `/api/study-materials/${id}/download?mode=${mode}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleDelete = async (r: StudyMaterial) => {
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/study-materials/${r.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setRows((prev) => prev.filter((row) => row.id !== r.id));
      message.success("Study material deleted.");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpload = async () => {
    let values: { title: string; batchId: string; description?: string };
    try {
      values = await form.validateFields();
    } catch {
      return; // form shows the field errors
    }
    const raw = fileList[0];
    const file = (raw?.originFileObj ?? raw) as File | undefined;
    if (!file) {
      message.error("Please select a PDF file.");
      return;
    }
    if (file.type && file.type !== ACCEPTED_MIME && !file.name?.toLowerCase().endsWith(".pdf")) {
      message.error("Only PDF files are allowed.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      message.error("File is too large (max 25 MB).");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("title", values.title);
      body.append("batchId", values.batchId);
      if (values.description) body.append("description", values.description);
      body.append("file", file);

      const res = await fetch("/api/study-materials", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");

      message.success("Notes uploaded.");
      setOpen(false);
      form.resetFields();
      setFileList([]);
      loadRows(filterBatch);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<StudyMaterial> = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      render: (t: string, r) => (
        <div>
          <Text strong>{t}</Text>
          {r.description ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.description}
              </Text>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Batch",
      dataIndex: "batch_name",
      key: "batch_name",
      render: (b: string | null) => b ?? "—",
    },
    {
      title: "Type",
      dataIndex: "kind",
      key: "kind",
      render: (k: string) => <Tag color="green">{k}</Tag>,
    },
    {
      title: "Size",
      dataIndex: "file_size",
      key: "file_size",
      render: (s: number | null) => formatFileSize(s),
    },
    {
      title: "Uploaded",
      dataIndex: "created_at",
      key: "created_at",
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, r) => (
        <Space size={0} wrap>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => openFile(r.id, "view")}
          >
            View
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => openFile(r.id, "download")}
          >
            Download
          </Button>
          <Popconfirm
            title="Delete this material?"
            description="The file will be permanently removed for students."
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
            Study Material
          </Title>
          <Text type="secondary">Share PDF notes with your batches</Text>
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
            onClick={() => setOpen(true)}
          >
            Upload notes
          </Button>
        </Space>
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
              <Empty description="No study material yet">
                <Button type="primary" onClick={() => setOpen(true)}>
                  Upload your first PDF
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <Modal
        title="Upload notes (PDF)"
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
          setFileList([]);
        }}
        onOk={handleUpload}
        okText="Upload"
        confirmLoading={submitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: "A title is required." }]}
          >
            <Input placeholder="e.g. Chapter 3 — Kinematics notes" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="batchId"
            label="Batch"
            rules={[{ required: true, message: "Select a batch." }]}
          >
            <Select
              placeholder="Select a batch"
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea
              rows={3}
              maxLength={1000}
              placeholder="A short note about this material"
            />
          </Form.Item>
          <Form.Item label="PDF file" required>
            <Upload
              accept=".pdf,application/pdf"
              maxCount={1}
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
              onRemove={() => setFileList([])}
            >
              <Button icon={<UploadOutlined />}>Select PDF</Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>
              PDF only, up to 25 MB.
            </Text>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Spin,
  Typography,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Title } = Typography;

type BatchForm = {
  name: string;
  course: string;
  secret_pass: string;
  description?: string;
  exam_level?: string;
};

export default function EditBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<BatchForm>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/batches/${id}`);
        if (!res.ok) {
          setError(
            (await res.json().catch(() => ({}))).error ?? "Failed to load batch."
          );
          return;
        }
        const b = await res.json();
        form.setFieldsValue({
          name: b.name ?? "",
          course: b.course ?? "",
          secret_pass: b.secret_pass ?? "",
          description: b.description ?? "",
          exam_level: b.exam_level ?? "",
        });
      } catch {
        setError("Failed to load batch.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, form]);

  const onFinish = async (values: BatchForm) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          course: values.course,
          secret_pass: values.secret_pass,
          description: values.description || null,
          exam_level: values.exam_level || null,
        }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error ?? "Failed to save"
        );
      message.success("Batch updated.");
      router.push(`/admin/batches/${id}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to save batch.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );

  if (error)
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
          <Empty description={error} />
        </Card>
      </div>
    );

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push(`/admin/batches/${id}`)}
        style={{ marginBottom: 8, paddingLeft: 0 }}
      >
        Batch
      </Button>

      <Title level={3} style={{ margin: "0 0 16px" }}>
        Edit batch
      </Title>

      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label="Batch name"
            rules={[{ required: true, message: "Enter a batch name" }]}
          >
            <Input placeholder="e.g. Fall 2026 - Section A" />
          </Form.Item>
          <Form.Item
            name="course"
            label="Course name"
            rules={[{ required: true, message: "Enter a course name" }]}
          >
            <Input placeholder="e.g. UPSC Prelims" />
          </Form.Item>
          <Form.Item
            name="secret_pass"
            label="Secret pass code"
            rules={[{ required: true, message: "Enter a secret pass code" }]}
          >
            <Input placeholder="e.g. CS101-FALL" />
          </Form.Item>
          <Form.Item name="exam_level" label="Exam level">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional" />
          </Form.Item>
          <Flex gap={8} justify="flex-end">
            <Button onClick={() => router.push(`/admin/batches/${id}`)}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save changes
            </Button>
          </Flex>
        </Form>
      </Card>
    </div>
  );
}

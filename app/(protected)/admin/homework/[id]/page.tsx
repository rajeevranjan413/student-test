"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  List,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { QuestionContent } from "@/components/QuestionContent";
import { DIFFICULTY_COLORS } from "@/utils/constants";
import { formatFileSize, isImageMime, type StoredFileMeta } from "@/utils/studyMaterial";

const { Title, Text, Paragraph } = Typography;

type Question = {
  uid: string;
  text: string;
  options: { key: string; text: string }[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

type HomeworkDetail = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  type: "mcq" | "file";
  title: string;
  description: string | null;
  due_at: string | null;
  total_questions: number | null;
  marks_per_question: number;
  negative_marking: number;
  files: StoredFileMeta[];
  status: "draft" | "published";
  is_published: boolean;
  attempt_count: number;
  questions: Question[];
};

/**
 * Admin Homework detail hub (F14 / D29): the full homework — MCQ questions (with the
 * correct answer marked, admin-only) or attached files with View / Download — plus
 * Delete. This is the only place a homework is viewed/downloaded/deleted; the list
 * screens are navigation-only.
 */
export default function HomeworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [hw, setHw] = useState<HomeworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/homework/${id}`);
        if (res.ok) setHw(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const openFile = async (fileId: string, mode: "view" | "download") => {
    try {
      const res = await fetch(
        `/api/homework/${id}/download?mode=${mode}&file=${encodeURIComponent(fileId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/homework/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      message.success(data.archived ? "Homework archived — history kept." : "Homework deleted.");
      router.push("/admin/homework");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <Spin />
        </div>
      </PageContainer>
    );
  }

  if (!hw) {
    return (
      <PageContainer>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/admin/homework")}>
          Back to homework
        </Button>
        <Card style={{ marginTop: 16 }}>
          <Empty description="Homework not found." />
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.back()}
        style={{ marginBottom: 12, paddingLeft: 0 }}
      >
        Back
      </Button>

      <Flex align="flex-start" justify="space-between" gap={12} wrap style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
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
              background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
              boxShadow: "0 10px 22px -10px #6366f1",
            }}
          >
            <SolutionOutlined />
          </span>
          <div style={{ minWidth: 0 }}>
            <Title level={3} style={{ margin: 0 }} ellipsis>
              {hw.title}
            </Title>
            <Space size={[6, 6]} wrap style={{ marginTop: 4 }}>
              {hw.batch_name ? <Tag>{hw.batch_name}</Tag> : null}
              <Tag color={hw.type === "mcq" ? "purple" : "blue"}>
                {hw.type === "mcq" ? "MCQ" : "PDF / Image"}
              </Tag>
              <Tag color={hw.is_published ? "green" : "default"}>
                {hw.is_published ? "Published" : "Draft"}
              </Tag>
            </Space>
          </div>
        </div>
        <Popconfirm
          title="Delete this homework?"
          description="If any student has done it, it is archived (history kept) instead."
          okText="Delete"
          okButtonProps={{ danger: true, loading: deleting }}
          onConfirm={handleDelete}
        >
          <Button danger icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>
      </Flex>

      <Card style={{ marginBottom: 16, borderRadius: 14 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Due">
            {hw.due_at ? new Date(hw.due_at).toLocaleString() : "No deadline"}
          </Descriptions.Item>
          <Descriptions.Item label="Completions">{hw.attempt_count}</Descriptions.Item>
          {hw.type === "mcq" ? (
            <>
              <Descriptions.Item label="Questions">
                {hw.questions.length}
                {hw.total_questions ? ` / ${hw.total_questions}` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="Marking">
                +{hw.marks_per_question} correct
                {hw.negative_marking ? ` · −${hw.negative_marking} wrong` : ""}
              </Descriptions.Item>
            </>
          ) : (
            <Descriptions.Item label="Files">{hw.files.length}</Descriptions.Item>
          )}
        </Descriptions>
        {hw.description ? (
          <Paragraph style={{ marginTop: 12, marginBottom: 0 }} type="secondary">
            {hw.description}
          </Paragraph>
        ) : null}
      </Card>

      {hw.type === "file" ? (
        <Card title="Files" style={{ borderRadius: 14 }}>
          {hw.files.length === 0 ? (
            <Empty description="No files attached." />
          ) : (
            <List
              dataSource={hw.files}
              rowKey="id"
              renderItem={(f) => (
                <List.Item
                  actions={[
                    <Button
                      key="view"
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => openFile(f.id, "view")}
                    >
                      View
                    </Button>,
                    <Button
                      key="dl"
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => openFile(f.id, "download")}
                    >
                      Download
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      isImageMime(f.mime_type) ? (
                        <FileImageOutlined style={{ fontSize: 22, color: "#0ea5e9" }} />
                      ) : (
                        <FilePdfOutlined style={{ fontSize: 22, color: "#dc2626" }} />
                      )
                    }
                    title={f.file_name}
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatFileSize(f.file_size)}
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      ) : (
        <Card title={`Questions (${hw.questions.length})`} style={{ borderRadius: 14 }}>
          {hw.questions.length === 0 ? (
            <Empty description="No questions." />
          ) : (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {hw.questions.map((q, i) => (
                <div key={q.uid}>
                  <Flex align="flex-start" gap={8} wrap>
                    <Text strong>{i + 1}.</Text>
                    <QuestionContent value={q.text} style={{ flex: 1, minWidth: 0, fontWeight: 600 }} />
                    {q.difficulty ? (
                      <Tag color={DIFFICULTY_COLORS[q.difficulty] ?? "default"}>{q.difficulty}</Tag>
                    ) : null}
                  </Flex>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.options.map((o) => {
                      const correct = o.key === q.correctOptionKey;
                      return (
                        <div
                          key={o.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 8,
                            background: correct ? "rgba(34,197,94,0.12)" : "transparent",
                            border: correct
                              ? "1px solid rgba(34,197,94,0.4)"
                              : "1px solid transparent",
                          }}
                        >
                          <Text strong={correct} style={{ minWidth: 18 }}>
                            {o.key}.
                          </Text>
                          <Text style={{ flex: 1 }}>{o.text}</Text>
                          {correct ? <CheckCircleFilled style={{ color: "#22c55e" }} /> : null}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation ? (
                    <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--muted-foreground)" }}>
                      <Text strong style={{ fontSize: 12.5 }}>
                        Explanation:{" "}
                      </Text>
                      <QuestionContent value={q.explanation} style={{ display: "inline" }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </Space>
          )}
        </Card>
      )}
    </PageContainer>
  );
}

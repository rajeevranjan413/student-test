"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  formatFileSize,
  isImageMime,
  type StudyMaterial,
} from "@/utils/studyMaterial";

const { Title, Text, Paragraph } = Typography;

/**
 * Student subject detail (F13 / D25): all notes filed under one subject folder.
 * Notes come from `GET /api/student/study-materials?subject=`, which re-checks the
 * student is enrolled in the subject's batch. Files open via the authorized
 * signed-URL endpoint, never a raw URL.
 */
export default function StudentSubjectNotesPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [rows, setRows] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `/api/student/study-materials?subject=${encodeURIComponent(id)}`
      );
      if (res.ok) setRows(await res.json());
      else setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(subjectId);
  }, [load, subjectId]);

  const openFile = async (id: string, mode: "view" | "download") => {
    try {
      const res = await fetch(`/api/study-materials/${id}/download?mode=${mode}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  return (
    <PageContainer max={960}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push("/student/study-material")}
        style={{ paddingLeft: 0, marginBottom: 8 }}
      >
        All subjects
      </Button>
      <Title level={3} style={{ marginBottom: 4 }}>
        Notes
      </Title>
      <Text type="secondary">Notes shared in this subject.</Text>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <Empty description="No notes in this subject yet. Check back later." />
        </Card>
      ) : (
        <Flex vertical gap={12} style={{ marginTop: 20 }}>
          {rows.map((m) => {
            const image = isImageMime(m.mime_type);
            return (
              <Card key={m.id} styles={{ body: { padding: 16 } }}>
                <Flex align="flex-start" gap={14} wrap>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: image ? "#0ea5e91a" : "#dc26261a",
                      color: image ? "#0ea5e9" : "#dc2626",
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    {image ? <FileImageOutlined /> : <FilePdfOutlined />}
                  </span>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <Text strong style={{ fontSize: 16 }}>
                      {m.title}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color={image ? "blue" : "red"}>
                        {image ? "Image" : "PDF"}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatFileSize(m.file_size)} ·{" "}
                        {new Date(m.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                    {m.description ? (
                      <Paragraph
                        type="secondary"
                        style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}
                        ellipsis={{ rows: 3, expandable: true, symbol: "more" }}
                      >
                        {m.description}
                      </Paragraph>
                    ) : null}
                  </div>
                  <Space>
                    <Button
                      icon={<EyeOutlined />}
                      onClick={() => openFile(m.id, "view")}
                    >
                      View
                    </Button>
                    <Button
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={() => openFile(m.id, "download")}
                    >
                      Download
                    </Button>
                  </Space>
                </Flex>
              </Card>
            );
          })}
        </Flex>
      )}
    </PageContainer>
  );
}

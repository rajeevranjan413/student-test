"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Empty, Flex, Space, Spin, Tag, Typography } from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { useBatches } from "@/components/providers/BatchProvider";
import { formatFileSize, type StudyMaterial } from "@/utils/studyMaterial";

const { Title, Text, Paragraph } = Typography;

/**
 * Student Study Material (F13): PDF notes shared to the student's enrolled batches.
 * Reached from the Study Material card on the student home (F12). Respects the
 * header batch switcher — when a batch is active, only that batch's notes show.
 * Files are fetched through the authorized signed-URL endpoint, never a raw URL.
 */
export default function StudentStudyMaterialPage() {
  const { message } = App.useApp();
  const { activeBatchId } = useBatches();
  const [rows, setRows] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  // loading is set *false* only after the awaited fetch (never synchronously) so
  // this is safe to call from the effect (react-hooks/set-state-in-effect).
  const load = useCallback(async (batch: string | null) => {
    try {
      const url = batch
        ? `/api/student/study-materials?batch=${encodeURIComponent(batch)}`
        : "/api/student/study-materials";
      const res = await fetch(url);
      if (res.ok) setRows(await res.json());
      else setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeBatchId);
  }, [load, activeBatchId]);

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
      <Title level={3} style={{ marginBottom: 4 }}>
        Study Material
      </Title>
      <Text type="secondary">Notes and resources shared by your teacher.</Text>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <Empty description="No study material yet. Check back later." />
        </Card>
      ) : (
        <Flex vertical gap={12} style={{ marginTop: 20 }}>
          {rows.map((m) => (
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
                    background: "#dc26261a",
                    color: "#dc2626",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  <FilePdfOutlined />
                </span>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <Text strong style={{ fontSize: 16 }}>
                    {m.title}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    {m.batch_name ? <Tag>{m.batch_name}</Tag> : null}
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
          ))}
        </Flex>
      )}
    </PageContainer>
  );
}

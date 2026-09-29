"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Col, Empty, Flex, Row, Spin, Tag, Typography } from "antd";
import { FolderOpenOutlined, RightOutlined } from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { useBatches } from "@/components/providers/BatchProvider";
import type { Subject } from "@/utils/studyMaterial";
import {
  markSeen,
  snapshotStatus,
  subjectSignature,
  type SeenStatus,
} from "@/utils/whatsNew";
import { NewBadge } from "@/components/student/NewBadge";

const { Title, Text } = Typography;

// A rotating palette so a grid of subject folders reads as a colourful set rather
// than one repeated tint. Cycled by index — stable per position on the page.
const FOLDER_PALETTE: { from: string; to: string }[] = [
  { from: "#6366f1", to: "#8b5cf6" }, // indigo → violet
  { from: "#f59e0b", to: "#f97316" }, // amber → orange
  { from: "#10b981", to: "#0d9488" }, // emerald → teal
  { from: "#ec4899", to: "#f43f5e" }, // pink → rose
  { from: "#0ea5e9", to: "#2563eb" }, // sky → blue
  { from: "#14b8a6", to: "#06b6d4" }, // teal → cyan
];

/**
 * Student Study Material (F13 / D25): the subject **folders** for the student's
 * enrolled batches. Reached from the Study Material card on the student home (F12).
 * Respects the header batch switcher — when a batch is active, only that batch's
 * subjects show. Tapping a folder opens its notes at `/student/study-material/[id]`.
 */
export default function StudentStudyMaterialPage() {
  const router = useRouter();
  const { activeBatchId } = useBatches();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusById, setStatusById] = useState<Record<string, SeenStatus>>({});

  // loading is set false only after the awaited fetch (never synchronously) so
  // this is safe to call from the effect.
  const load = useCallback(async (batch: string | null) => {
    try {
      const url = batch
        ? `/api/student/subjects?batch=${encodeURIComponent(batch)}`
        : "/api/student/subjects";
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as Subject[];
        // A folder's signature folds in its latest note activity + note count, so an
        // added/edited note flags it "Updated" (F16).
        const sigs = data.map((s) => ({
          id: s.id,
          sig: subjectSignature(s.activity_at ?? null, s.note_count),
        }));
        setStatusById(snapshotStatus("study", sigs).statusById);
        setSubjects(data);
        markSeen("study", sigs);
      } else setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeBatchId);
  }, [load, activeBatchId]);

  return (
    <PageContainer max={960}>
      <Title level={3} style={{ marginBottom: 4 }}>
        Study Material
      </Title>
      <Text type="secondary">
        Open a subject to see all the notes shared by your teacher.
      </Text>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : subjects.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <Empty description="No subjects yet. Check back later." />
        </Card>
      ) : (
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          {subjects.map((s, i) => {
            const pal = FOLDER_PALETTE[i % FOLDER_PALETTE.length];
            return (
            <Col xs={24} sm={12} md={8} key={s.id}>
              <Card
                hoverable
                className="tap stu-card"
                styles={{ body: { padding: 16 } }}
                style={{
                  height: "100%",
                  ["--a" as string]: pal.from,
                  ["--b" as string]: pal.to,
                }}
                onClick={() => router.push(`/student/study-material/${s.id}`)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    className="stu-tile"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      fontSize: 22,
                      flexShrink: 0,
                      ["--a" as string]: pal.from,
                      ["--b" as string]: pal.to,
                    }}
                  >
                    <FolderOpenOutlined />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Flex align="center" gap={8} wrap>
                      <Text strong style={{ fontSize: 16 }}>
                        {s.name}
                      </Text>
                      <NewBadge status={statusById[s.id]} />
                    </Flex>
                    <div style={{ marginTop: 2 }}>
                      {s.batch_name ? <Tag>{s.batch_name}</Tag> : null}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {s.note_count} note{s.note_count === 1 ? "" : "s"}
                      </Text>
                    </div>
                  </div>
                  <RightOutlined style={{ color: "#9ca3af" }} />
                </div>
              </Card>
            </Col>
            );
          })}
        </Row>
      )}
    </PageContainer>
  );
}

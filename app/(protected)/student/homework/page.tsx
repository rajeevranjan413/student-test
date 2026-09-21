"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Col, Empty, Flex, Row, Spin, Tag, Typography } from "antd";
import {
  CheckCircleTwoTone,
  FileImageOutlined,
  FilePdfOutlined,
  RightOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { useBatches } from "@/components/providers/BatchProvider";
import { isImageMime } from "@/utils/studyMaterial";
import type { StudentHomeworkItem } from "@/utils/homework";

const { Title, Text } = Typography;

/**
 * Student Homework (F14): the homework assigned to the student's enrolled batches.
 * MCQ homework opens into an attempt; PDF/image homework opens to read + mark done.
 * Respects the header batch switcher. Reached from the Homework card on the home.
 */
export default function StudentHomeworkPage() {
  const router = useRouter();
  const { activeBatchId } = useBatches();
  const [items, setItems] = useState<StudentHomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (batch: string | null) => {
    try {
      const url = batch
        ? `/api/student/homework?batch=${encodeURIComponent(batch)}`
        : "/api/student/homework";
      const res = await fetch(url);
      if (res.ok) setItems(await res.json());
      else setItems([]);
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
        Homework
      </Title>
      <Text type="secondary">Complete the assignments from your teacher.</Text>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <Empty description="No homework yet. Check back later." />
        </Card>
      ) : (
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          {items.map((h) => {
            const done = h.attempt != null;
            return (
              <Col xs={24} sm={12} md={8} key={h.id}>
                <Card
                  hoverable
                  className="tap"
                  styles={{ body: { padding: 16 } }}
                  onClick={() => router.push(`/student/homework/${h.id}`)}
                >
                  <Flex align="flex-start" gap={12}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: h.type === "mcq" ? "#7c3aed1a" : "#0284c71a",
                        color: h.type === "mcq" ? "#7c3aed" : "#0284c7",
                        fontSize: 22,
                        flexShrink: 0,
                      }}
                    >
                      {h.type === "mcq" ? (
                        <SolutionOutlined />
                      ) : isImageMime(h.files[0]?.mime_type) ? (
                        <FileImageOutlined />
                      ) : (
                        <FilePdfOutlined />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 15, display: "block" }} ellipsis>
                        {h.title}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        {h.batch_name ? <Tag>{h.batch_name}</Tag> : null}
                        <Tag color={h.type === "mcq" ? "purple" : "blue"}>
                          {h.type === "mcq" ? "MCQ" : "PDF / Image"}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {h.type === "mcq"
                            ? `${h.question_count} question${h.question_count === 1 ? "" : "s"}`
                            : `${h.files.length} file${h.files.length === 1 ? "" : "s"}`}
                          {h.due_at ? ` · Due ${new Date(h.due_at).toLocaleDateString()}` : ""}
                        </Text>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        {done ? (
                          <Tag icon={<CheckCircleTwoTone twoToneColor="#16a34a" />} color="success">
                            {h.type === "mcq" && h.attempt?.score != null
                              ? `Done · ${h.attempt.score}/${h.attempt.max_score}`
                              : "Done"}
                          </Tag>
                        ) : (
                          <Tag color="processing">To do</Tag>
                        )}
                      </div>
                    </div>
                    <RightOutlined style={{ color: "#9ca3af" }} />
                  </Flex>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </PageContainer>
  );
}

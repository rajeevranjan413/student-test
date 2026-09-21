"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Flex, Space, Spin, Tag, Typography } from "antd";
import {
  ClockCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  PlusOutlined,
  RightOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { BatchPicker } from "@/components/admin/BatchPicker";
import { DrillHeader } from "@/components/admin/DrillHeader";
import { useDrillStack } from "@/components/admin/useDrillStack";
import { isImageMime } from "@/utils/studyMaterial";
import type { HomeworkListItem } from "@/utils/homework";

const { Title, Text } = Typography;

type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type View = { mode: "batches" } | { mode: "list"; batchId: string; batchName: string };

const ACCENT_FROM = "#818cf8";
const ACCENT_TO = "#6366f1";

/**
 * Admin Homework (F14, batch-first per D29): open on a batch grid (homework counts),
 * drill into a batch's homework cards, and open a card's DETAIL page
 * (`/admin/homework/[id]`) — the only place a homework is viewed/downloaded/deleted.
 */
export default function AdminHomeworkPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<HomeworkListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { current, push, back } = useDrillStack<View>({ mode: "batches" });

  useEffect(() => {
    (async () => {
      try {
        const [bRes, hRes] = await Promise.all([
          fetch("/api/batches"),
          fetch("/api/homework"),
        ]);
        if (bRes.ok) setBatches(await bRes.json());
        if (hRes.ok) setItems(await hRes.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const countByBatch = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of items) {
      if (!h.batch_id) continue;
      m.set(h.batch_id, (m.get(h.batch_id) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const batchCards = useMemo(
    () =>
      batches.map((b) => ({
        id: b.id,
        name: b.name,
        start_time: b.start_time,
        end_time: b.end_time,
        count: countByBatch.get(b.id) ?? 0,
      })),
    [batches, countByBatch]
  );

  const batchItems = useMemo(
    () => (current.mode === "list" ? items.filter((h) => h.batch_id === current.batchId) : []),
    [items, current]
  );

  const newHref =
    current.mode === "list"
      ? `/admin/homework/new?batch=${encodeURIComponent(current.batchId)}`
      : "/admin/homework/new";

  return (
    <PageContainer>
      {current.mode === "batches" ? (
        <>
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
                  boxShadow: `0 10px 22px -10px ${ACCENT_TO}`,
                }}
              >
                <SolutionOutlined />
              </span>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Homework
                </Title>
                <Text type="secondary">Pick a batch to see its homework</Text>
              </div>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(newHref)}>
              Create homework
            </Button>
          </div>

          <BatchPicker
            batches={batchCards}
            loading={loading}
            icon={<SolutionOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            countNoun={(n) => `${n} homework`}
            onSelect={(batchId) => {
              const b = batches.find((x) => x.id === batchId);
              push({ mode: "list", batchId, batchName: b?.name ?? "Batch" });
            }}
            empty={
              <Empty description="No batches yet. Create a batch first, then assign homework.">
                <Button type="primary" onClick={() => router.push("/admin/batches/new")}>
                  Create a batch
                </Button>
              </Empty>
            }
          />
        </>
      ) : (
        <>
          <DrillHeader
            crumbs={[{ label: "All batches", onClick: back }, { label: current.batchName }]}
            title={current.batchName}
            subtitle={`${batchItems.length} homework`}
            icon={<SolutionOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            onBack={back}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(newHref)}>
                Create homework
              </Button>
            }
          />

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Spin />
            </div>
          ) : batchItems.length === 0 ? (
            <Card>
              <Empty description="No homework in this batch yet.">
                <Button type="primary" onClick={() => router.push(newHref)}>
                  Create homework
                </Button>
              </Empty>
            </Card>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}
            >
              {batchItems.map((h) => {
                const fileCount = h.files?.length ?? 0;
                const firstMime = h.files?.[0]?.mime_type ?? null;
                return (
                  <Card
                    key={h.id}
                    hoverable
                    className="tap"
                    styles={{ body: { padding: 18 } }}
                    style={{ borderRadius: 16 }}
                    onClick={() => router.push(`/admin/homework/${h.id}`)}
                  >
                    <Flex align="flex-start" gap={12}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 42,
                          height: 42,
                          borderRadius: 11,
                          background: h.type === "mcq" ? "#ede9fe" : "#e0f2fe",
                          color: h.type === "mcq" ? "#7c3aed" : "#0284c7",
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        {h.type === "mcq" ? (
                          <SolutionOutlined />
                        ) : isImageMime(firstMime) ? (
                          <FileImageOutlined />
                        ) : (
                          <FilePdfOutlined />
                        )}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Text strong ellipsis style={{ display: "block", fontSize: 15.5 }}>
                          {h.title}
                        </Text>
                        <Space size={[4, 4]} wrap style={{ marginTop: 6 }}>
                          <Tag color={h.type === "mcq" ? "purple" : "blue"} style={{ marginInlineEnd: 0 }}>
                            {h.type === "mcq" ? "MCQ" : "PDF / Image"}
                          </Tag>
                          <Tag color={h.is_published ? "green" : "default"} style={{ marginInlineEnd: 0 }}>
                            {h.is_published ? "Published" : "Draft"}
                          </Tag>
                        </Space>
                      </div>
                      <RightOutlined style={{ color: "rgba(148,163,184,0.9)", fontSize: 13, marginTop: 4 }} />
                    </Flex>

                    <div style={{ marginTop: 14 }}>
                      <Text type="secondary" style={{ fontSize: 12.5 }}>
                        {h.type === "mcq"
                          ? `${h.question_count} question${h.question_count === 1 ? "" : "s"}`
                          : `${fileCount} file${fileCount === 1 ? "" : "s"}`}
                      </Text>
                      {h.due_at ? (
                        <Text type="secondary" style={{ fontSize: 12.5, display: "block", marginTop: 4 }}>
                          <ClockCircleOutlined style={{ marginRight: 6 }} />
                          Due {new Date(h.due_at).toLocaleString()}
                        </Text>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

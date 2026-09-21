"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Spin, Tag, Typography } from "antd";
import {
  CalendarOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { BatchPicker } from "@/components/admin/BatchPicker";
import { DrillHeader } from "@/components/admin/DrillHeader";
import { useDrillStack } from "@/components/admin/useDrillStack";

const { Title, Text } = Typography;

type TestRow = {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number;
  total_questions: number | null;
  status: "draft" | "published" | "closed";
  batch_id: string | null;
  batch_name: string | null;
  question_count: number;
};

type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type View = { mode: "batches" } | { mode: "tests"; batchId: string; batchName: string };

const STATUS_COLOR: Record<string, string> = {
  draft: "default",
  published: "green",
  closed: "red",
};

const ACCENT_FROM = "#34d399";
const ACCENT_TO = "#059669";

export default function QuizzesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { current, push, back } = useDrillStack<View>({ mode: "batches" });

  useEffect(() => {
    (async () => {
      try {
        const [bRes, tRes] = await Promise.all([
          fetch("/api/batches"),
          fetch("/api/tests"),
        ]);
        if (bRes.ok) setBatches(await bRes.json());
        if (tRes.ok) setTests(await tRes.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Test count per batch (matches the drill-down exactly — both exclude archived).
  const countByBatch = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tests) {
      if (!t.batch_id) continue;
      m.set(t.batch_id, (m.get(t.batch_id) ?? 0) + 1);
    }
    return m;
  }, [tests]);

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

  const batchTests = useMemo(
    () =>
      current.mode === "tests"
        ? tests.filter((t) => t.batch_id === current.batchId)
        : [],
    [tests, current]
  );

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
                <FileTextOutlined />
              </span>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  Tests
                </Title>
                <Text type="secondary">Pick a batch to see its scheduled tests</Text>
              </div>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push("/admin/quizzes/new")}
            >
              Create Test
            </Button>
          </div>

          <BatchPicker
            batches={batchCards}
            loading={loading}
            icon={<FileTextOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            countNoun={(n) => `${n} test${n === 1 ? "" : "s"}`}
            onSelect={(batchId) => {
              const b = batches.find((x) => x.id === batchId);
              push({ mode: "tests", batchId, batchName: b?.name ?? "Batch" });
            }}
            empty={
              <Empty description="No batches yet. Create a batch first, then add tests.">
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
            subtitle={`${batchTests.length} test${batchTests.length === 1 ? "" : "s"}`}
            icon={<FileTextOutlined />}
            accentFrom={ACCENT_FROM}
            accentTo={ACCENT_TO}
            onBack={back}
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push("/admin/quizzes/new")}
              >
                Create Test
              </Button>
            }
          />

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
              <Spin />
            </div>
          ) : batchTests.length === 0 ? (
            <Card>
              <Empty description="No tests in this batch yet.">
                <Button type="primary" onClick={() => router.push("/admin/quizzes/new")}>
                  Create a test
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
              {batchTests.map((t) => (
                <Card
                  key={t.id}
                  hoverable
                  className="tap"
                  styles={{ body: { padding: 18 } }}
                  style={{ borderRadius: 16 }}
                  onClick={() => router.push(`/admin/quizzes/${t.id}`)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text strong ellipsis style={{ display: "block", fontSize: 15.5 }}>
                        {t.title}
                      </Text>
                      <div style={{ marginTop: 6 }}>
                        <Tag color={STATUS_COLOR[t.status] ?? "default"} style={{ marginInlineEnd: 0 }}>
                          {t.status}
                        </Tag>
                      </div>
                    </div>
                    <RightOutlined style={{ color: "rgba(148,163,184,0.9)", fontSize: 13, marginTop: 4 }} />
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      <CalendarOutlined style={{ marginRight: 6 }} />
                      {t.scheduled_at ? new Date(t.scheduled_at).toLocaleString() : "Not scheduled"}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      <FieldTimeOutlined style={{ marginRight: 6 }} />
                      {t.duration_minutes} min ·{" "}
                      {t.question_count}
                      {t.total_questions ? ` / ${t.total_questions}` : ""} question
                      {t.question_count === 1 ? "" : "s"}
                    </Text>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Alert,
  Button,
  Card,
  Divider,
  Empty,
  Radio,
  Result,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleTwoTone,
  DownloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";

const { Title, Text, Paragraph } = Typography;

type Option = { key: string; text: string };
type Question = { id: string; text: string; options: Option[]; order: number };
type ReviewItem = {
  id: string;
  text: string;
  options: Option[];
  correctKey: string;
  chosenKey: string | null;
  isCorrect: boolean;
  explanation: string | null;
};
type Attempt = {
  status: "submitted" | "done";
  score?: number | null;
  max_score?: number | null;
  correct_count?: number | null;
  submitted_at: string;
};
type Homework = {
  id: string;
  type: "mcq" | "file";
  title: string;
  description: string | null;
  due_at: string | null;
  batch_name: string | null;
  file_name: string | null;
  mime_type: string | null;
};
type Bootstrap = {
  homework: Homework;
  questions: Question[];
  attempt: Attempt | null;
  review: ReviewItem[] | null;
};

/**
 * Student homework detail (F14). MCQ → attempt & submit once (graded), then review.
 * PDF/image → view/download, then mark done (no upload back).
 */
export default function StudentHomeworkDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();

  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/student/homework/${id}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load homework");
        if (!active) return;
        setData(body);
        setAttempt(body.attempt);
        setReview(body.review);
      } catch (err) {
        if (active)
          message.error(
            err instanceof Error ? err.message : "Could not load homework"
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, message]);

  const openFile = async (mode: "view" | "download") => {
    try {
      const res = await fetch(`/api/homework/${id}/download?mode=${mode}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Could not open the file");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const submitMcq = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const payload = {
        answers: data.questions.map((q) => ({
          questionId: q.id,
          optionKey: answers[q.id] ?? null,
        })),
      };
      const res = await fetch(`/api/student/homework/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not submit");
      setReview(body.review);
      setAttempt({
        status: "submitted",
        score: body.score,
        max_score: body.maxScore,
        correct_count: body.correctCount,
        submitted_at: body.submittedAt,
      });
      message.success("Homework submitted!");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const markDone = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/student/homework/${id}/complete`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not mark done");
      setAttempt({ status: "done", submitted_at: body.submitted_at });
      message.success("Marked as done!");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not mark done");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer max={820}>
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer max={820}>
        <Result
          status="404"
          title="Homework not found"
          extra={
            <Button type="primary" onClick={() => router.push("/student/homework")}>
              Back to homework
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const hw = data.homework;
  const submitted = attempt != null;

  return (
    <PageContainer max={820}>
      <Title level={3} style={{ marginBottom: 4 }}>
        {hw.title}
      </Title>
      <Space wrap style={{ marginBottom: 8 }}>
        {hw.batch_name ? <Tag>{hw.batch_name}</Tag> : null}
        <Tag color={hw.type === "mcq" ? "purple" : "blue"}>
          {hw.type === "mcq" ? "MCQ" : "PDF / Image"}
        </Tag>
        {hw.due_at ? (
          <Text type="secondary">Due {new Date(hw.due_at).toLocaleString()}</Text>
        ) : null}
      </Space>
      {hw.description ? <Paragraph type="secondary">{hw.description}</Paragraph> : null}

      {/* ---------- FILE HOMEWORK ---------- */}
      {hw.type === "file" && (
        <Card>
          <Space wrap style={{ marginBottom: 16 }}>
            <Button icon={<EyeOutlined />} onClick={() => openFile("view")}>
              View
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => openFile("download")}>
              Download
            </Button>
          </Space>
          <Divider />
          {submitted ? (
            <Alert
              type="success"
              showIcon
              message="You marked this homework done."
              description={
                attempt?.submitted_at
                  ? `Completed on ${new Date(attempt.submitted_at).toLocaleString()}`
                  : undefined
              }
            />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              <Text type="secondary">
                Read the file above, then mark this homework as done.
              </Text>
              <Button type="primary" loading={submitting} onClick={markDone}>
                Mark as done
              </Button>
            </Space>
          )}
        </Card>
      )}

      {/* ---------- MCQ HOMEWORK ---------- */}
      {hw.type === "mcq" && (
        <>
          {submitted && (
            <Card style={{ marginBottom: 16 }}>
              <Space size="large" wrap>
                <Statistic
                  title="Score"
                  value={attempt?.score ?? 0}
                  suffix={`/ ${attempt?.max_score ?? 0}`}
                  prefix={<CheckCircleTwoTone twoToneColor="#16a34a" />}
                />
                <Statistic
                  title="Correct"
                  value={attempt?.correct_count ?? 0}
                  suffix={`/ ${data.questions.length}`}
                />
              </Space>
            </Card>
          )}

          {data.questions.length === 0 ? (
            <Card>
              <Empty description="This homework has no questions." />
            </Card>
          ) : submitted && review ? (
            // Graded review
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {review.map((q, i) => (
                <Card key={q.id} size="small">
                  <Text strong>
                    {i + 1}. {q.text}
                  </Text>
                  <Space direction="vertical" size={2} style={{ margin: "8px 0", width: "100%" }}>
                    {q.options.map((o) => {
                      const isCorrect = o.key === q.correctKey;
                      const isChosen = o.key === q.chosenKey;
                      return (
                        <Text
                          key={o.key}
                          type={isCorrect ? "success" : isChosen ? "danger" : undefined}
                          strong={isCorrect || isChosen}
                        >
                          {o.key}. {o.text}
                          {isCorrect ? "  ✓ correct" : isChosen ? "  ✗ your answer" : ""}
                        </Text>
                      );
                    })}
                  </Space>
                  {q.chosenKey == null && (
                    <Tag color="warning">Not answered</Tag>
                  )}
                  {q.explanation ? (
                    <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                      {q.explanation}
                    </Paragraph>
                  ) : null}
                </Card>
              ))}
            </Space>
          ) : (
            // Attempt form
            <>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {data.questions.map((q, i) => (
                  <Card key={q.id} size="small">
                    <Text strong>
                      {i + 1}. {q.text}
                    </Text>
                    <Radio.Group
                      style={{ width: "100%", marginTop: 8 }}
                      value={answers[q.id]}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                    >
                      <Space direction="vertical" style={{ width: "100%" }}>
                        {q.options.map((o) => (
                          <Radio key={o.key} value={o.key}>
                            {o.key}. {o.text}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                  </Card>
                ))}
              </Space>
              <Divider />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="primary" loading={submitting} onClick={submitMcq}>
                  Submit homework
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                You can submit once. Unanswered questions score zero.
              </Text>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

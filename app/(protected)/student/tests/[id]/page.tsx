"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Flex,
  Progress,
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
  ClockCircleOutlined,
  CloseCircleTwoTone,
  MinusCircleTwoTone,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;
const { Countdown } = Statistic;

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
type ResultPayload = {
  score: number;
  max_score: number;
  correct_count: number;
  is_late: boolean;
  submitted_at: string;
  auto_submitted?: boolean;
  passing_marks?: number | null;
  review: ReviewItem[];
};
type Meta = {
  id: string;
  title: string;
  exam_level: string | null;
  batch_name: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  marks_per_question: number;
  negative_marking: number;
  passing_marks: number | null;
  total_questions: number | null;
  question_count: number;
};
type Boot = {
  meta: Meta;
  phase: "upcoming" | "open" | "closed";
  state: "not_started" | "in_progress" | "submitted" | "missed";
  attempt?: { started_at: string; deadline: string; answers: Ans[] };
  questions?: Question[];
  result?: ResultPayload;
};
type Ans = { questionId: string; optionKey: string | null };

type UiPhase = "loading" | "prestart" | "upcoming" | "missed" | "taking" | "result";

export default function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [ui, setUi] = useState<UiPhase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submittedRef = useRef(false); // guards against double auto/manual submit
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyStarted = useCallback(
    (qs: Question[], deadlineIso: string, saved: Ans[]) => {
      setQuestions([...qs].sort((a, b) => a.order - b.order));
      setDeadline(new Date(deadlineIso).getTime());
      const map: Record<string, string> = {};
      for (const a of saved) if (a.optionKey != null) map[a.questionId] = a.optionKey;
      setAnswers(map);
      setUi("taking");
    },
    []
  );

  // --- Bootstrap ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/student/tests/${id}`);
        const data = (await res.json()) as Boot & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not load this test.");
          setUi("prestart");
          return;
        }
        setMeta(data.meta);
        if (data.state === "submitted" && data.result) {
          setResult(data.result);
          setUi("result");
        } else if (data.state === "in_progress" && data.attempt && data.questions) {
          applyStarted(data.questions, data.attempt.deadline, data.attempt.answers);
        } else if (data.state === "missed") {
          setUi("missed");
        } else if (data.phase === "upcoming") {
          setUi("upcoming");
        } else {
          setUi("prestart");
        }
      } catch {
        setError("Could not load this test.");
        setUi("prestart");
      }
    })();
  }, [id, applyStarted]);

  // --- Autosave (debounced) ---
  const scheduleSave = useCallback(
    (next: Record<string, string>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const payload: Ans[] = Object.entries(next).map(([questionId, optionKey]) => ({
          questionId,
          optionKey,
        }));
        fetch(`/api/student/tests/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        }).catch(() => {
          /* best-effort; the final submit is the source of truth */
        });
      }, 700);
    },
    [id]
  );

  function pick(questionId: string, optionKey: string) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionKey };
      scheduleSave(next);
      return next;
    });
  }

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const payload: Ans[] = Object.entries(answers).map(([questionId, optionKey]) => ({
        questionId,
        optionKey,
      }));
      try {
        const res = await fetch(`/api/student/tests/${id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        });
        const data = (await res.json()) as ResultPayload & { error?: string };
        if (!res.ok) {
          // Already submitted / time up — reload to reflect the server's view.
          message.warning(data.error ?? "Could not submit.");
          submittedRef.current = false;
          const boot = await fetch(`/api/student/tests/${id}`).then((r) => r.json());
          if (boot.state === "submitted" && boot.result) {
            setResult(boot.result);
            setUi("result");
          }
          return;
        }
        setResult(data);
        setUi("result");
        if (auto) message.info("Time's up — your test was submitted automatically.");
        else message.success("Test submitted.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, id, message]
  );

  async function start() {
    setStarting(true);
    try {
      const res = await fetch(`/api/student/tests/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error ?? "Could not start the test.");
        return;
      }
      applyStarted(data.questions ?? [], data.deadline, data.answers ?? []);
    } finally {
      setStarting(false);
    }
  }

  function confirmSubmit() {
    const unanswered = questions.length - Object.keys(answers).length;
    modal.confirm({
      title: "Submit test?",
      content:
        unanswered > 0
          ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. You can't change answers after submitting.`
          : "You can't change answers after submitting.",
      okText: "Submit",
      cancelText: "Keep working",
      onOk: () => doSubmit(false),
    });
  }

  const answeredCount = Object.keys(answers).length;

  // ---------- Renders ----------
  if (ui === "loading")
    return (
      <Flex justify="center" style={{ padding: 64 }}>
        <Spin size="large" />
      </Flex>
    );

  const shell = (children: React.ReactNode) => (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>{children}</div>
  );

  if (ui === "upcoming" && meta)
    return shell(
      <Result
        icon={<ClockCircleOutlined />}
        title={meta.title}
        subTitle={`This test opens on ${meta.scheduled_at ? new Date(meta.scheduled_at).toLocaleString() : "its scheduled time"}. Come back then.`}
        extra={
          <Button onClick={() => router.push("/student")}>Back to my tests</Button>
        }
      />
    );

  if (ui === "missed" && meta)
    return shell(
      <Result
        status="error"
        title="Test window closed"
        subTitle={`The window for "${meta.title}" has closed and you did not submit an attempt.`}
        extra={<Button onClick={() => router.push("/student")}>Back to my tests</Button>}
      />
    );

  if (ui === "prestart" && meta)
    return shell(
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>
          {meta.title}
        </Title>
        {error && (
          <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
        )}
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          {meta.batch_name && (
            <Descriptions.Item label="Batch">{meta.batch_name}</Descriptions.Item>
          )}
          {meta.exam_level && (
            <Descriptions.Item label="Level">{meta.exam_level}</Descriptions.Item>
          )}
          <Descriptions.Item label="Opens">
            {meta.scheduled_at ? new Date(meta.scheduled_at).toLocaleString() : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Duration">
            {meta.duration_minutes} minutes
          </Descriptions.Item>
          <Descriptions.Item label="Questions">{meta.question_count}</Descriptions.Item>
          <Descriptions.Item label="Marks / question">
            {meta.marks_per_question}
          </Descriptions.Item>
          {meta.negative_marking > 0 && (
            <Descriptions.Item label="Negative marking">
              −{meta.negative_marking} per wrong answer
            </Descriptions.Item>
          )}
          {meta.passing_marks != null && (
            <Descriptions.Item label="Passing marks">{meta.passing_marks}</Descriptions.Item>
          )}
        </Descriptions>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Once you start, the timer runs continuously."
          description="You have one attempt. If you close the tab the timer keeps going and your saved answers are submitted automatically when time runs out."
        />
        <Space>
          <Button type="primary" size="large" loading={starting} onClick={start}>
            Start test
          </Button>
          <Button onClick={() => router.push("/student")}>Cancel</Button>
        </Space>
      </Card>
    );

  if (ui === "result" && result)
    return shell(
      <>
        <Result
          status={
            meta?.passing_marks != null
              ? result.score >= meta.passing_marks
                ? "success"
                : "warning"
              : "info"
          }
          title={meta?.title ?? "Test submitted"}
          subTitle={
            <Space direction="vertical" size={4}>
              <Text>
                Score <b>{result.score}</b> / {result.max_score} · {result.correct_count}{" "}
                correct
              </Text>
              <Space>
                {result.is_late && <Tag color="volcano">Submitted late</Tag>}
                {result.auto_submitted && <Tag color="gold">Auto-submitted</Tag>}
                {meta?.passing_marks != null && (
                  <Tag color={result.score >= meta.passing_marks ? "green" : "red"}>
                    {result.score >= meta.passing_marks ? "Passed" : "Did not pass"}
                  </Tag>
                )}
              </Space>
            </Space>
          }
          extra={<Button onClick={() => router.push("/student")}>Back to my tests</Button>}
        />
        <Divider>Review</Divider>
        <Flex vertical gap={16}>
          {result.review.map((r, i) => (
            <Card key={r.id} size="small">
              <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
                {r.isCorrect ? (
                  <CheckCircleTwoTone twoToneColor="#52c41a" />
                ) : r.chosenKey == null ? (
                  <MinusCircleTwoTone twoToneColor="#faad14" />
                ) : (
                  <CloseCircleTwoTone twoToneColor="#ff4d4f" />
                )}
                <Text strong>
                  {i + 1}. {r.text}
                </Text>
              </Flex>
              <Flex vertical gap={4} style={{ paddingLeft: 24 }}>
                {r.options.map((o) => {
                  const isCorrect = o.key === r.correctKey;
                  const isChosen = o.key === r.chosenKey;
                  return (
                    <Text
                      key={o.key}
                      type={isCorrect ? "success" : isChosen ? "danger" : undefined}
                    >
                      {o.key}. {o.text}
                      {isCorrect && " ✓"}
                      {isChosen && !isCorrect && " (your answer)"}
                    </Text>
                  );
                })}
                {r.chosenKey == null && <Text type="secondary">Not answered</Text>}
                {r.explanation && (
                  <Text type="secondary" italic>
                    {r.explanation}
                  </Text>
                )}
              </Flex>
            </Card>
          ))}
        </Flex>
      </>
    );

  // ---------- Taking ----------
  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <Card
        styles={{ body: { padding: 16 } }}
        style={{ position: "sticky", top: 16, zIndex: 10, marginBottom: 16 }}
      >
        <Flex justify="space-between" align="center" gap={16} wrap>
          <div>
            <Text strong style={{ fontSize: 16 }}>
              {meta?.title}
            </Text>
            <div>
              <Text type="secondary">
                Answered {answeredCount} / {questions.length}
              </Text>
            </div>
          </div>
          <Flex align="center" gap={16}>
            {deadline && (
              <Countdown
                title="Time left"
                value={deadline}
                onFinish={() => doSubmit(true)}
                valueStyle={{ fontSize: 20 }}
              />
            )}
            <Button
              type="primary"
              loading={submitting}
              onClick={confirmSubmit}
            >
              Submit
            </Button>
          </Flex>
        </Flex>
        <Progress
          percent={
            questions.length ? Math.round((answeredCount / questions.length) * 100) : 0
          }
          showInfo={false}
          style={{ marginTop: 8, marginBottom: 0 }}
        />
      </Card>

      <Flex vertical gap={16}>
        {questions.map((q, i) => (
          <Card key={q.id} size="small">
            <Paragraph strong style={{ marginBottom: 12 }}>
              {i + 1}. {q.text}
            </Paragraph>
            <Radio.Group
              value={answers[q.id]}
              onChange={(e) => pick(q.id, e.target.value)}
            >
              <Space direction="vertical">
                {q.options.map((o) => (
                  <Radio key={o.key} value={o.key}>
                    <b>{o.key}.</b> {o.text}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Card>
        ))}
      </Flex>

      <Flex justify="flex-end" style={{ marginTop: 16 }}>
        <Button type="primary" size="large" loading={submitting} onClick={confirmSubmit}>
          Submit test
        </Button>
      </Flex>
    </div>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { DIFFICULTY_COLORS } from "@/utils/constants";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatBatchTiming } from "@/utils/batch";
import { QuestionEditorModal } from "@/components/admin/QuestionEditorModal";
import { QuestionContent } from "@/components/QuestionContent";

const { Title, Text } = Typography;

type Option = { key: string; text: string };
type GQ = {
  uid: string;
  text: string;
  options: Option[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

type TestPayload = {
  id: string;
  title: string;
  batch_id: string;
  scheduled_at: string | null;
  duration_minutes: number;
  total_questions: number | null;
  marks_per_question: number;
  negative_marking: number;
  passing_marks: number | null;
  status: "draft" | "published" | "closed";
  attempt_count: number;
  questions_editable: boolean;
  questions: GQ[];
};

const OPTION_KEYS = ["A", "B", "C", "D"];
let counter = 0;
const nextUid = () => `q_${Date.now()}_${counter++}`;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft (hidden from students)" },
  { value: "published", label: "Published (open to students)" },
  { value: "closed", label: "Closed (no new attempts)" },
];

export default function EditTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [batches, setBatches] = useState<
    { id: string; name: string; start_time: string | null; end_time: string | null }[]
  >([]);
  const [questions, setQuestions] = useState<GQ[]>([]);
  const [questionsEditable, setQuestionsEditable] = useState(true);
  const [attemptCount, setAttemptCount] = useState(0);

  const [editing, setEditing] = useState<GQ | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [testRes, batchesRes] = await Promise.all([
          fetch(`/api/tests/${id}`),
          fetch("/api/batches"),
        ]);
        if (!testRes.ok) {
          setError(
            (await testRes.json().catch(() => ({}))).error ?? "Failed to load test."
          );
          return;
        }
        const test: TestPayload = await testRes.json();
        if (batchesRes.ok) setBatches(await batchesRes.json());

        setQuestions(test.questions);
        setQuestionsEditable(test.questions_editable);
        setAttemptCount(test.attempt_count);
        form.setFieldsValue({
          title: test.title,
          batchId: test.batch_id,
          scheduledAt: test.scheduled_at ? dayjs(test.scheduled_at) : undefined,
          durationMinutes: test.duration_minutes,
          totalQuestions: test.total_questions ?? undefined,
          marksPerQuestion: test.marks_per_question,
          negativeMarking: test.negative_marking,
          passingMarks: test.passing_marks ?? undefined,
          status: test.status,
        });
      } catch {
        setError("Failed to load test.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, form]);

  // ----- Question editor -----
  const blankQuestion = (): GQ => ({
    uid: nextUid(),
    text: "",
    options: OPTION_KEYS.map((k) => ({ key: k, text: "" })),
    correctOptionKey: "A",
    explanation: "",
  });
  const startManualAdd = () => {
    setEditingIsNew(true);
    setEditing(blankQuestion());
  };
  const startEdit = (q: GQ) => {
    setEditingIsNew(false);
    setEditing(q);
  };
  const closeEditor = () => {
    setEditing(null);
    setEditingIsNew(false);
  };
  const saveEdit = (edited: GQ) => {
    setQuestions((prev) =>
      editingIsNew
        ? [...prev, edited]
        : prev.map((q) => (q.uid === edited.uid ? edited : q))
    );
    closeEditor();
  };
  const removeQuestion = (uid: string) =>
    setQuestions((prev) => prev.filter((q) => q.uid !== uid));

  // ----- Save -----
  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return; // antd shows field errors
    }
    if (questionsEditable && questions.length === 0) {
      message.warning("A test needs at least one question.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          batchId: values.batchId,
          scheduledAt: values.scheduledAt.toISOString(),
          durationMinutes: values.durationMinutes,
          totalQuestions: values.totalQuestions,
          marksPerQuestion: values.marksPerQuestion ?? 1,
          negativeMarking: values.negativeMarking ?? 0,
          passingMarks: values.passingMarks ?? null,
          status: values.status,
          // Only send questions when they're still editable (no attempts).
          ...(questionsEditable
            ? {
                questions: questions.map((q) => ({
                  text: q.text,
                  options: q.options,
                  correctOptionKey: q.correctOptionKey,
                  explanation: q.explanation,
                  difficulty: q.difficulty,
                })),
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save test");
      message.success("Test updated.");
      router.push(`/admin/quizzes/${id}`);
      router.refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save test");
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
      <PageContainer max={920}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/admin/quizzes")}
          style={{ marginBottom: 16 }}
        >
          Back to tests
        </Button>
        <Card>
          <Empty description={error} />
        </Card>
      </PageContainer>
    );

  return (
    <PageContainer max={920}>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push(`/admin/quizzes/${id}`)}
        style={{ marginBottom: 8, paddingLeft: 0 }}
      >
        Back to test
      </Button>
      <Title level={3} style={{ marginTop: 0 }}>
        Edit test
      </Title>

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Test title"
            rules={[{ required: true, message: "Enter a test title" }]}
          >
            <Input placeholder="e.g. Newton's Laws — Weekly Test" />
          </Form.Item>

          <Form.Item
            name="batchId"
            label="Batch"
            rules={[{ required: true, message: "Select a batch" }]}
          >
            <Select
              placeholder={batches.length ? "Select a batch" : "No batches yet"}
              options={batches.map((b) => {
                const timing = formatBatchTiming(b.start_time, b.end_time);
                return {
                  value: b.id,
                  label: `${b.name}${timing ? ` (${timing})` : ""}`,
                };
              })}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="scheduledAt"
                label="Scheduled date & time"
                rules={[{ required: true, message: "Pick a date & time" }]}
              >
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="durationMinutes"
                label="Duration (minutes)"
                rules={[{ required: true, message: "Required" }]}
              >
                <InputNumber min={1} max={600} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="totalQuestions"
                label="Total required questions"
                rules={[{ required: true, message: "Required" }]}
              >
                <InputNumber min={1} max={200} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: "Select a status" }]}
          >
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Collapse
            ghost
            items={[
              {
                key: "adv",
                label: "Advanced — marks scheme (optional)",
                children: (
                  <Row gutter={16}>
                    <Col xs={8}>
                      <Form.Item name="marksPerQuestion" label="Marks / question">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="negativeMarking" label="Negative marking">
                        <InputNumber min={0} step={0.25} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="passingMarks" label="Passing marks">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Form>
      </Card>

      {/* Questions */}
      <Card style={{ marginTop: 24 }}>
        <Flex align="center" justify="space-between" gap={8} wrap style={{ marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            Questions ({questions.length})
          </Title>
          {questionsEditable && (
            <Button icon={<PlusOutlined />} onClick={startManualAdd}>
              Add question
            </Button>
          )}
        </Flex>

        {!questionsEditable && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Questions are locked"
            description={`This test already has ${attemptCount} attempt${
              attemptCount === 1 ? "" : "s"
            }. Questions can no longer be changed so existing scores stay valid — you can still edit the settings above.`}
          />
        )}

        {questions.length === 0 ? (
          <Empty description="No questions yet" />
        ) : (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {questions.map((q, i) => (
              <Card key={q.uid} size="small">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, fontWeight: 600 }}>
                    <Text strong>{i + 1}. </Text>
                    <QuestionContent value={q.text} style={{ display: "inline", fontWeight: 600 }} />
                  </div>
                  {q.difficulty && (
                    <Tag color={DIFFICULTY_COLORS[q.difficulty] ?? "default"}>
                      {q.difficulty}
                    </Tag>
                  )}
                </div>
                <Space direction="vertical" size={2} style={{ margin: "8px 0", width: "100%" }}>
                  {q.options.map((o) => (
                    <Text
                      key={o.key}
                      type={o.key === q.correctOptionKey ? "success" : undefined}
                      strong={o.key === q.correctOptionKey}
                    >
                      {o.key}. {o.text}
                      {o.key === q.correctOptionKey ? "  ✓" : ""}
                    </Text>
                  ))}
                </Space>
                {q.explanation && (
                  <div style={{ marginBottom: 8, color: "var(--muted-foreground)" }}>
                    <QuestionContent value={q.explanation} />
                  </div>
                )}
                {questionsEditable && (
                  <Space wrap>
                    <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(q)}>
                      Edit
                    </Button>
                    <Button size="small" danger onClick={() => removeQuestion(q.uid)}>
                      Remove
                    </Button>
                  </Space>
                )}
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <Divider />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => router.push(`/admin/quizzes/${id}`)}>Cancel</Button>
        <Button type="primary" loading={saving} onClick={handleSave}>
          Save changes
        </Button>
      </div>

      {editing && (
        <QuestionEditorModal
          key={editing.uid}
          question={editing}
          isNew={editingIsNew}
          itemNoun="test"
          onCancel={closeEditor}
          onSave={saveEdit}
        />
      )}
    </PageContainer>
  );
}

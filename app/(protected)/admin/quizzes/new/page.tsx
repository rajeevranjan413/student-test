"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UploadFile } from "antd";
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  InboxOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { DIFFICULTY_COLORS } from "@/utils/constants";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatBatchTiming } from "@/utils/batch";
import { QuestionEditorModal } from "@/components/admin/QuestionEditorModal";
import { QuestionContent } from "@/components/QuestionContent";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type Option = { key: string; text: string };
type GQ = {
  uid: string;
  text: string;
  options: Option[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

type Setup = {
  title: string;
  batchId: string;
  scheduledAt: string; // ISO
  durationMinutes: number;
  totalQuestions: number;
  marksPerQuestion: number;
  negativeMarking: number;
  passingMarks?: number;
};

const OPTION_KEYS = ["A", "B", "C", "D"];
let counter = 0;
const nextUid = () => `q_${Date.now()}_${counter++}`;

export default function NewTestWizard() {
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [step, setStep] = useState(0);
  const [batches, setBatches] = useState<{ id: string; name: string; start_time: string | null; end_time: string | null }[]>([]);
  const [setupForm] = Form.useForm();
  const [setup, setSetup] = useState<Setup | null>(null);

  // Step 2 (generate) state
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [roundCount, setRoundCount] = useState(5);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Step 3 (review) state
  const [candidates, setCandidates] = useState<GQ[]>([]);
  const [approved, setApproved] = useState<GQ[]>([]);
  const [editing, setEditing] = useState<GQ | null>(null);
  // Distinguishes editing an existing candidate from adding a brand-new manual one.
  const [editingIsNew, setEditingIsNew] = useState(false);

  const [publishing, setPublishing] = useState(false);

  // Load the teacher's batches for the setup step.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/batches");
        if (res.ok) setBatches(await res.json());
      } catch {
        /* handled by empty state */
      }
    })();
  }, []);

  const required = setup?.totalQuestions ?? 0;
  const approvedEnough = approved.length >= required && required > 0;

  // ----- Step 1: setup -----
  const handleSetupNext = async () => {
    try {
      const v = await setupForm.validateFields();
      setSetup({
        title: v.title.trim(),
        batchId: v.batchId,
        scheduledAt: v.scheduledAt.toISOString(),
        durationMinutes: v.durationMinutes,
        totalQuestions: v.totalQuestions,
        marksPerQuestion: v.marksPerQuestion ?? 1,
        negativeMarking: v.negativeMarking ?? 0,
        passingMarks: v.passingMarks,
      });
      setRoundCount(v.totalQuestions);
      setStep(1);
    } catch {
      /* antd shows field errors */
    }
  };

  // ----- Step 2: generate -----
  const handleGenerate = async () => {
    if (fileList.length === 0) {
      message.warning("Upload at least one image first.");
      return;
    }
    setGenerating(true);
    try {
      const fd = new FormData();
      fileList.forEach((f) => {
        const file = (f.originFileObj ?? f) as File;
        fd.append("images", file);
      });
      fd.append("count", String(roundCount));
      fd.append("extraPrompt", extraPrompt);

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      const incoming: GQ[] = (data.questions ?? []).map(
        (q: Omit<GQ, "uid">) => ({ ...q, uid: nextUid() })
      );
      if (incoming.length === 0) {
        message.warning("No questions came back. Try again or adjust the prompt.");
      } else {
        // Append to any still-unreviewed candidates so approved work is never lost.
        setCandidates((prev) => [...prev, ...incoming]);
        message.success(`Generated ${incoming.length} question(s) to review.`);
        setStep(2);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ----- Step 3: review -----
  const approve = (q: GQ) => {
    setApproved((prev) => [...prev, q]);
    setCandidates((prev) => prev.filter((c) => c.uid !== q.uid));
  };
  const reject = (uid: string) =>
    setCandidates((prev) => prev.filter((c) => c.uid !== uid));
  const removeApproved = (uid: string) =>
    setApproved((prev) => prev.filter((c) => c.uid !== uid));

  // Open the question editor with a blank MCQ so a teacher can author one by hand.
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
    if (editingIsNew) {
      // The teacher authored this one, so it's auto-approved (no review queue).
      setApproved((prev) => [...prev, edited]);
      setStep(2);
    } else {
      setCandidates((prev) => prev.map((c) => (c.uid === edited.uid ? edited : c)));
    }
    closeEditor();
  };

  const goToConfirm = () => {
    if (approved.length === 0) {
      message.warning("Approve at least one question first.");
      return;
    }
    if (!approvedEnough) {
      modal.confirm({
        title: "Publish with fewer questions?",
        content: `You have approved ${approved.length} of ${required} required questions. Continue anyway?`,
        okText: "Continue",
        onOk: () => setStep(3),
      });
    } else {
      setStep(3);
    }
  };

  // ----- Step 4: publish -----
  const publish = async (asDraft = false) => {
    if (!setup) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: setup.title,
          batchId: setup.batchId,
          scheduledAt: setup.scheduledAt,
          durationMinutes: setup.durationMinutes,
          totalQuestions: setup.totalQuestions,
          marksPerQuestion: setup.marksPerQuestion,
          negativeMarking: setup.negativeMarking,
          passingMarks: setup.passingMarks,
          status: asDraft ? "draft" : "published",
          questions: approved.map((q) => ({
            text: q.text,
            options: q.options,
            correctOptionKey: q.correctOptionKey,
            explanation: q.explanation,
            difficulty: q.difficulty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save test");
      message.success(asDraft ? "Saved as draft." : "Test published!");
      router.push("/admin/quizzes");
      router.refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save test");
    } finally {
      setPublishing(false);
    }
  };

  const batchName = useMemo(
    () => batches.find((b) => b.id === setup?.batchId)?.name ?? "—",
    [batches, setup]
  );

  return (
    <PageContainer max={920}>
      <Title level={3}>Create AI Test</Title>
      <Steps
        current={step}
        style={{ margin: "24px 0 32px" }}
        items={[
          { title: "Setup" },
          { title: "Generate" },
          { title: "Review" },
          { title: "Publish" },
        ]}
      />

      {/* STEP 1 — SETUP */}
      {step === 0 && (
        <Card>
          <Form
            form={setupForm}
            layout="vertical"
            initialValues={{
              durationMinutes: 30,
              totalQuestions: 10,
              marksPerQuestion: 1,
              negativeMarking: 0,
            }}
          >
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
                notFoundContent="Create a batch first"
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

            <div style={{ textAlign: "right" }}>
              <Button type="primary" onClick={handleSetupNext}>
                Next: Generate questions
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* STEP 2 — GENERATE */}
      {step === 1 && (
        <Card>
          <Paragraph type="secondary">
            Upload a photo of handwritten notes or a book page. The AI reads it and
            drafts questions for you to review.
          </Paragraph>
          <Upload.Dragger
            multiple
            accept="image/*"
            listType="picture"
            fileList={fileList}
            beforeUpload={() => false /* prevent auto-upload; we send them ourselves */}
            onChange={({ fileList: fl }) => setFileList(fl)}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag image(s) here</p>
            <p className="ant-upload-hint">Handwritten notes or printed book pages</p>
          </Upload.Dragger>

          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24} sm={8}>
              <Text>Questions this round</Text>
              <InputNumber
                min={1}
                max={20}
                value={roundCount}
                onChange={(v) => setRoundCount(v ?? 1)}
                style={{ width: "100%", marginTop: 4 }}
              />
            </Col>
            <Col xs={24} sm={16}>
              <Text>Extra instructions (optional)</Text>
              <TextArea
                rows={2}
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                placeholder="e.g. focus on Newton's third law; make them application-based"
                style={{ marginTop: 4 }}
              />
            </Col>
          </Row>

          <Divider>or</Divider>
          <div style={{ textAlign: "center" }}>
            <Button icon={<PlusOutlined />} onClick={startManualAdd}>
              Add question manually
            </Button>
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              No image needed — type a question and its options yourself.
            </Paragraph>
          </div>

          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Space wrap>
              {(approved.length > 0 || candidates.length > 0) && (
                <Button onClick={() => setStep(2)}>
                  Review ({approved.length} approved
                  {candidates.length ? `, ${candidates.length} pending` : ""})
                </Button>
              )}
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={handleGenerate}
              >
                Generate
              </Button>
            </Space>
          </div>
          {generating && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <Spin tip="Asking the AI…">
                <div style={{ padding: 24 }} />
              </Spin>
            </div>
          )}
        </Card>
      )}

      {/* STEP 3 — REVIEW */}
      {step === 2 && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Row align="middle" gutter={[16, 12]} wrap>
              <Col xs={24} md="auto" flex="auto" style={{ minWidth: 0 }}>
                <Text strong>
                  Approved {approved.length} / {required}
                </Text>
                <Progress
                  percent={required ? Math.min(100, (approved.length / required) * 100) : 0}
                  showInfo={false}
                />
              </Col>
              <Col xs={24} md="auto">
                <Space wrap>
                  <Button onClick={() => setStep(1)}>Generate more</Button>
                  <Button icon={<PlusOutlined />} onClick={startManualAdd}>
                    Add manually
                  </Button>
                  <Button type="primary" onClick={goToConfirm}>
                    Continue
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            <Col xs={24} md={approved.length ? 14 : 24}>
              <Title level={5}>To review ({candidates.length})</Title>
              {candidates.length === 0 ? (
                <Empty description="Nothing to review — generate or add one">
                  <Space wrap>
                    <Button onClick={() => setStep(1)}>Generate more</Button>
                    <Button icon={<PlusOutlined />} onClick={startManualAdd}>
                      Add manually
                    </Button>
                  </Space>
                </Empty>
              ) : (
                <Space direction="vertical" style={{ width: "100%" }} size="middle">
                  {candidates.map((q) => (
                    <Card key={q.uid} size="small">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <QuestionContent value={q.text} style={{ fontWeight: 600, flex: 1 }} />
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
                        <div
                          style={{ marginBottom: 8, color: "var(--muted-foreground)" }}
                        >
                          <QuestionContent value={q.explanation} />
                        </div>
                      )}
                      <Space wrap>
                        <Button
                          type="primary"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => approve(q)}
                        >
                          Approve
                        </Button>
                        <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(q)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<CloseOutlined />}
                          onClick={() => reject(q.uid)}
                        >
                          Reject
                        </Button>
                      </Space>
                    </Card>
                  ))}
                </Space>
              )}
            </Col>

            {approved.length > 0 && (
              <Col xs={24} md={10}>
                <Title level={5}>Approved ({approved.length})</Title>
                <Space direction="vertical" style={{ width: "100%" }} size="small">
                  {approved.map((q, i) => (
                    <Card key={q.uid} size="small">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Text>{i + 1}. </Text>
                          <QuestionContent value={q.text} style={{ display: "inline" }} />
                        </div>
                        <Button
                          size="small"
                          type="text"
                          danger
                          onClick={() => removeApproved(q.uid)}
                        >
                          Remove
                        </Button>
                      </div>
                    </Card>
                  ))}
                </Space>
              </Col>
            )}
          </Row>
        </>
      )}

      {/* STEP 4 — CONFIRM & PUBLISH */}
      {step === 3 && setup && (
        <Card>
          <Title level={5}>Confirm & publish</Title>
          <Row gutter={[16, 8]}>
            <Col xs={12}>
              <Text type="secondary">Title</Text>
              <div>{setup.title}</div>
            </Col>
            <Col xs={12}>
              <Text type="secondary">Batch</Text>
              <div>{batchName}</div>
            </Col>
            <Col xs={12}>
              <Text type="secondary">Scheduled</Text>
              <div>{new Date(setup.scheduledAt).toLocaleString()}</div>
            </Col>
            <Col xs={12}>
              <Text type="secondary">Duration</Text>
              <div>{setup.durationMinutes} min</div>
            </Col>
            <Col xs={12}>
              <Text type="secondary">Questions</Text>
              <div>
                {approved.length} approved / {setup.totalQuestions} required
              </div>
            </Col>
            <Col xs={12}>
              <Text type="secondary">Marks scheme</Text>
              <div>
                +{setup.marksPerQuestion} / −{setup.negativeMarking}
                {setup.passingMarks != null ? `, pass ${setup.passingMarks}` : ""}
              </div>
            </Col>
          </Row>

          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={() => setStep(2)}>Back to review</Button>
            <Space wrap>
              <Button loading={publishing} onClick={() => publish(true)}>
                Save as draft
              </Button>
              <Button type="primary" loading={publishing} onClick={() => publish(false)}>
                Publish test
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Edit modal — remounted per question (key) so it initialises from props
          without a prop→state sync effect. */}
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

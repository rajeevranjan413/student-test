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
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { DIFFICULTY_COLORS } from "@/utils/constants";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatBatchTiming } from "@/utils/batch";
import {
  ACCEPT_ATTR,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_FILES_PER_ITEM,
} from "@/utils/homework";
import { isAcceptedFile } from "@/utils/studyMaterial";

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

const OPTION_KEYS = ["A", "B", "C", "D"];
let counter = 0;
const nextUid = () => `hq_${Date.now()}_${counter++}`;

type BatchOpt = { id: string; name: string; start_time: string | null; end_time: string | null };

/**
 * Create Homework (F14). One screen, two tabs:
 *   • MCQ  — build questions by hand AND/OR generate them from a photo (same AI
 *            endpoint as Tests). Students attempt & submit; graded server-side.
 *   • PDF / Image — upload a file the student reads and marks done.
 * Shared header fields (title, batch, description, optional due date, publish) apply
 * to both. Submit posts to POST /api/homework (JSON for MCQ, multipart for file).
 */
export default function NewHomeworkPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [batches, setBatches] = useState<BatchOpt[]>([]);
  const [form] = Form.useForm();
  const [type, setType] = useState<"mcq" | "file">("mcq");
  const [publishState, setPublishState] = useState<"published" | "draft">("published");
  const [saving, setSaving] = useState(false);

  // MCQ builder state
  const [questions, setQuestions] = useState<GQ[]>([]);
  const [editing, setEditing] = useState<GQ | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [genFiles, setGenFiles] = useState<UploadFile[]>([]);
  const [roundCount, setRoundCount] = useState(5);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // File tab state
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/batches");
        if (res.ok) {
          const data: BatchOpt[] = await res.json();
          setBatches(data);
          // Prefill the batch when we arrived from a batch's homework view (D29).
          // Read from window.location to avoid useSearchParams' Suspense requirement.
          const preset = new URLSearchParams(window.location.search).get("batch");
          if (preset && data.some((b) => b.id === preset)) {
            form.setFieldValue("batchId", preset);
          }
        }
      } catch {
        /* handled by empty state */
      }
    })();
  }, [form]);

  // ----- MCQ builder helpers -----
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
      editingIsNew ? [...prev, edited] : prev.map((q) => (q.uid === edited.uid ? edited : q))
    );
    closeEditor();
  };
  const removeQuestion = (uid: string) =>
    setQuestions((prev) => prev.filter((q) => q.uid !== uid));

  const handleGenerate = async () => {
    if (genFiles.length === 0) {
      message.warning("Upload at least one image first.");
      return;
    }
    setGenerating(true);
    try {
      const fd = new FormData();
      genFiles.forEach((f) => {
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
        setQuestions((prev) => [...prev, ...incoming]);
        message.success(`Added ${incoming.length} generated question(s). Review below.`);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ----- Submit -----
  const submit = async () => {
    let values: {
      title: string;
      batchId: string;
      description?: string;
      dueAt?: { toISOString: () => string } | null;
      totalQuestions?: number;
      marksPerQuestion?: number;
      negativeMarking?: number;
    };
    try {
      values = await form.validateFields();
    } catch {
      return; // antd shows field errors
    }

    const publish = publishState === "published";
    const dueAtIso = values.dueAt ? values.dueAt.toISOString() : null;

    if (type === "mcq") {
      if (questions.length === 0) {
        message.warning("Add at least one question (manually or via AI).");
        return;
      }
      const doSubmit = async () => {
        setSaving(true);
        try {
          const res = await fetch("/api/homework", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: values.title.trim(),
              batchId: values.batchId,
              description: values.description ?? "",
              dueAt: dueAtIso,
              totalQuestions: values.totalQuestions ?? questions.length,
              marksPerQuestion: values.marksPerQuestion ?? 1,
              negativeMarking: values.negativeMarking ?? 0,
              status: publish ? "published" : "draft",
              questions: questions.map((q) => ({
                text: q.text,
                options: q.options,
                correctOptionKey: q.correctOptionKey,
                explanation: q.explanation,
                difficulty: q.difficulty,
              })),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to save homework");
          message.success(publish ? "Homework published!" : "Saved as draft.");
          router.push("/admin/homework");
          router.refresh();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to save homework");
        } finally {
          setSaving(false);
        }
      };
      const target = values.totalQuestions ?? questions.length;
      if (publish && questions.length < target) {
        modal.confirm({
          title: "Publish with fewer questions?",
          content: `You have ${questions.length} of ${target} target questions. Continue?`,
          okText: "Continue",
          onOk: doSubmit,
        });
      } else {
        await doSubmit();
      }
      return;
    }

    // file homework
    const files = fileList
      .map((f) => (f.originFileObj ?? f) as File | undefined)
      .filter((f): f is File => !!f);
    if (files.length === 0) {
      message.error("Please select at least one PDF or image file.");
      return;
    }
    if (files.length > MAX_FILES_PER_ITEM) {
      message.error(`You can attach up to ${MAX_FILES_PER_ITEM} files at once.`);
      return;
    }
    for (const file of files) {
      if (!isAcceptedFile(file.type || "", file.name || "")) {
        message.error(`"${file.name}": only PDF or image files are allowed.`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        message.error(`"${file.name}" is too large (max ${MAX_FILE_LABEL}).`);
        return;
      }
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("title", values.title.trim());
      body.append("batchId", values.batchId);
      if (values.description) body.append("description", values.description);
      if (dueAtIso) body.append("dueAt", dueAtIso);
      body.append("status", publish ? "published" : "draft");
      for (const file of files) body.append("file", file);

      const res = await fetch("/api/homework", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      message.success(publish ? "Homework published!" : "Saved as draft.");
      router.push("/admin/homework");
      router.refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const batchOptions = useMemo(
    () =>
      batches.map((b) => {
        const timing = formatBatchTiming(b.start_time, b.end_time);
        return { value: b.id, label: `${b.name}${timing ? ` (${timing})` : ""}` };
      }),
    [batches]
  );

  return (
    <PageContainer max={920}>
      <Title level={3}>Create Homework</Title>

      <Card style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ marksPerQuestion: 1, negativeMarking: 0, totalQuestions: 5 }}
        >
          <Form.Item
            name="title"
            label="Homework title"
            rules={[{ required: true, message: "Enter a homework title" }]}
          >
            <Input placeholder="e.g. Chapter 3 — Practice set" maxLength={200} />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="batchId"
                label="Batch"
                rules={[{ required: true, message: "Select a batch" }]}
              >
                <Select
                  placeholder={batches.length ? "Select a batch" : "No batches yet"}
                  options={batchOptions}
                  notFoundContent="Create a batch first"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="dueAt" label="Due date & time (optional)">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Instructions / description (optional)">
            <TextArea rows={2} maxLength={1000} placeholder="Any instructions for students" />
          </Form.Item>

          <Form.Item label="Visibility">
            <Segmented
              value={publishState}
              onChange={(v) => setPublishState(v as "published" | "draft")}
              options={[
                { label: "Publish now", value: "published" },
                { label: "Save as draft", value: "draft" },
              ]}
            />
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Drafts are hidden from students until you publish.
              </Text>
            </div>
          </Form.Item>

          <Tabs
            activeKey={type}
            onChange={(k) => setType(k as "mcq" | "file")}
            items={[
              { key: "mcq", label: "MCQ questions" },
              { key: "file", label: "PDF / Image" },
            ]}
          />

          {type === "mcq" ? (
            <div>
              <Collapse
                ghost
                items={[
                  {
                    key: "adv",
                    label: "Marks scheme & target (optional)",
                    children: (
                      <Row gutter={16}>
                        <Col xs={8}>
                          <Form.Item name="totalQuestions" label="Target questions">
                            <InputNumber min={1} max={200} style={{ width: "100%" }} />
                          </Form.Item>
                        </Col>
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
                      </Row>
                    ),
                  },
                ]}
              />
            </div>
          ) : null}
        </Form>
      </Card>

      {/* MCQ TAB BODY */}
      {type === "mcq" && (
        <>
          <Card style={{ marginBottom: 16 }} title="Generate from a photo (optional)">
            <Paragraph type="secondary">
              Upload a photo of notes or a book page — the AI drafts questions you can
              edit before saving.
            </Paragraph>
            <Upload.Dragger
              multiple
              accept="image/*"
              listType="picture"
              fileList={genFiles}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setGenFiles(fl)}
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
                  placeholder="e.g. focus on definitions; make them application-based"
                  style={{ marginTop: 4 }}
                />
              </Col>
            </Row>
            <div style={{ textAlign: "right", marginTop: 16 }}>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={handleGenerate}
              >
                Generate
              </Button>
            </div>
            {generating && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <Spin tip="Asking the AI…">
                  <div style={{ padding: 16 }} />
                </Spin>
              </div>
            )}
          </Card>

          <Card
            title={`Questions (${questions.length})`}
            extra={
              <Button icon={<PlusOutlined />} onClick={startManualAdd}>
                Add manually
              </Button>
            }
          >
            {questions.length === 0 ? (
              <Empty description="No questions yet — generate from a photo or add one by hand.">
                <Button type="primary" icon={<PlusOutlined />} onClick={startManualAdd}>
                  Add your first question
                </Button>
              </Empty>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                {questions.map((q, i) => (
                  <Card key={q.uid} size="small">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <Text strong>
                        {i + 1}. {q.text}
                      </Text>
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
                    <Space wrap>
                      <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(q)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeQuestion(q.uid)}
                      >
                        Remove
                      </Button>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </>
      )}

      {/* FILE TAB BODY */}
      {type === "file" && (
        <Card title="Upload PDF or image">
          <Paragraph type="secondary">
            Students read these files and mark the homework done — no upload back.
          </Paragraph>
          <Upload
            accept={ACCEPT_ATTR}
            multiple
            maxCount={MAX_FILES_PER_ITEM}
            listType="text"
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            onRemove={(f) =>
              setFileList((prev) => prev.filter((x) => x.uid !== f.uid))
            }
          >
            <Button icon={<UploadOutlined />}>Select file(s)</Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
            PDF or image (PNG, JPG, WebP, GIF). Attach up to {MAX_FILES_PER_ITEM}{" "}
            files, each up to {MAX_FILE_LABEL}.
          </Text>
        </Card>
      )}

      <Divider />
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Button onClick={() => router.push("/admin/homework")}>Cancel</Button>
        <Button type="primary" loading={saving} onClick={submit}>
          {publishState === "published" ? "Publish homework" : "Save draft"}
        </Button>
      </div>

      {editing && (
        <EditQuestionModal
          key={editing.uid}
          question={editing}
          isNew={editingIsNew}
          onCancel={closeEditor}
          onSave={saveEdit}
        />
      )}
    </PageContainer>
  );
}

function EditQuestionModal({
  question,
  isNew = false,
  onCancel,
  onSave,
}: {
  question: GQ;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (q: GQ) => void;
}) {
  const { message } = App.useApp();
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState<Option[]>(() =>
    OPTION_KEYS.map((k) => question.options.find((o) => o.key === k) ?? { key: k, text: "" })
  );
  const [correct, setCorrect] = useState(question.correctOptionKey);
  const [explanation, setExplanation] = useState(question.explanation ?? "");

  const handleOk = () => {
    const trimmedText = text.trim();
    const trimmedOptions = options.map((o) => ({ ...o, text: o.text.trim() }));
    if (!trimmedText) {
      message.error("Enter the question text.");
      return;
    }
    if (trimmedOptions.some((o) => !o.text)) {
      message.error("Fill in all four options.");
      return;
    }
    onSave({
      ...question,
      text: trimmedText,
      options: trimmedOptions,
      correctOptionKey: correct,
      explanation: explanation.trim(),
    });
  };

  return (
    <Modal
      open
      title={isNew ? "Add question" : "Edit question"}
      onCancel={onCancel}
      onOk={handleOk}
      okText={isNew ? "Add to homework" : "Save"}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Text>Question</Text>
        <Input.TextArea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        <Text>Options (select the correct one)</Text>
        <Radio.Group value={correct} onChange={(e) => setCorrect(e.target.value)} style={{ width: "100%" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            {options.map((o, i) => (
              <div key={o.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Radio value={o.key} />
                <Input
                  addonBefore={o.key}
                  value={o.text}
                  onChange={(e) => {
                    const copy = [...options];
                    copy[i] = { ...o, text: e.target.value };
                    setOptions(copy);
                  }}
                />
              </div>
            ))}
          </Space>
        </Radio.Group>
        <Text>Explanation (optional)</Text>
        <Input.TextArea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Space>
    </Modal>
  );
}

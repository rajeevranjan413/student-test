"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReadOutlined,
  RightOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { BatchPicker } from "@/components/admin/BatchPicker";
import { DrillHeader } from "@/components/admin/DrillHeader";
import { useDrillStack } from "@/components/admin/useDrillStack";
import {
  ACCEPT_ATTR,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_FILES_PER_ITEM,
  formatFileSize,
  isAcceptedFile,
  isImageMime,
  type StudyMaterial,
  type Subject,
} from "@/utils/studyMaterial";

const { Title, Text } = Typography;

type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type View =
  | { mode: "batches" }
  | { mode: "subjects"; batchId: string; batchName: string }
  | { mode: "notes"; batchId: string; batchName: string; subjectId: string; subjectName: string };

const ACCENT_FROM = "#22d3ee";
const ACCENT_TO = "#0891b2";

/**
 * Admin Study Material (F13, batch-first drill per D29): batch grid (subject counts)
 * → a batch's subjects (folders) → a subject's notes. Every action — Add subject,
 * Add notes, View / Download / Delete note, Delete subject — lives at the level where
 * it belongs; the batch and subject grids are navigation-only.
 */
export default function AdminStudyMaterialPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const { current, push, back, jumpTo } = useDrillStack<View>({ mode: "batches" });

  // Add-subject modal (opened from a batch's subjects view)
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectForm] = Form.useForm();

  // Add-notes modal (opened from a subject's notes view)
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [notesForm] = Form.useForm();

  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [sRes, mRes] = await Promise.all([
      fetch("/api/subjects"),
      fetch("/api/study-materials"),
    ]);
    if (sRes.ok) setSubjects(await sRes.json());
    if (mRes.ok) setMaterials(await mRes.json());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const bRes = await fetch("/api/batches");
        if (bRes.ok) setBatches(await bRes.json());
        await loadData();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const subjectsByBatch = useMemo(() => {
    const m = new Map<string, Subject[]>();
    for (const s of subjects) {
      const list = m.get(s.batch_id) ?? [];
      list.push(s);
      m.set(s.batch_id, list);
    }
    return m;
  }, [subjects]);

  const notesBySubject = useMemo(() => {
    const m = new Map<string, StudyMaterial[]>();
    for (const n of materials) {
      if (!n.subject_id) continue;
      const list = m.get(n.subject_id) ?? [];
      list.push(n);
      m.set(n.subject_id, list);
    }
    return m;
  }, [materials]);

  const batchCards = useMemo(
    () =>
      batches.map((b) => ({
        id: b.id,
        name: b.name,
        start_time: b.start_time,
        end_time: b.end_time,
        count: subjectsByBatch.get(b.id)?.length ?? 0,
      })),
    [batches, subjectsByBatch]
  );

  const openFile = async (materialId: string, fileId: string, mode: "view" | "download") => {
    try {
      const res = await fetch(
        `/api/study-materials/${materialId}/download?mode=${mode}&file=${encodeURIComponent(fileId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleAddSubject = async () => {
    if (current.mode === "batches") return;
    let values: { name: string };
    try {
      values = await subjectForm.validateFields();
    } catch {
      return;
    }
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, batchId: current.batchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add subject");
      message.success("Subject added.");
      setSubjectOpen(false);
      subjectForm.resetFields();
      await loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not add subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    setBusyId(subjectId);
    try {
      const res = await fetch(`/api/subjects/${subjectId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete subject");
      message.success("Subject deleted.");
      back(); // climb back to the batch's subjects view
      await loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete subject");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddNotes = async () => {
    if (current.mode !== "notes") return;
    let values: { title: string; description?: string };
    try {
      values = await notesForm.validateFields();
    } catch {
      return;
    }
    const files = fileList
      .map((f) => (f.originFileObj ?? f) as File)
      .filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      message.error("Please select at least one PDF or image file.");
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

    setNotesSaving(true);
    try {
      const body = new FormData();
      body.append("title", values.title);
      body.append("subjectId", current.subjectId);
      if (values.description) body.append("description", values.description);
      for (const file of files) body.append("file", file);

      const res = await fetch("/api/study-materials", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");

      message.success("Notes added.");
      setNotesOpen(false);
      notesForm.resetFields();
      setFileList([]);
      await loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setNotesSaving(false);
    }
  };

  const handleDeleteNote = async (m: StudyMaterial) => {
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/study-materials/${m.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setMaterials((prev) => prev.filter((x) => x.id !== m.id));
      message.success("Note deleted.");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  // ---- Level 1: batch grid ----
  if (current.mode === "batches") {
    return (
      <PageContainer>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
        >
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
            <ReadOutlined />
          </span>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Study Material
            </Title>
            <Text type="secondary">Pick a batch to manage its subjects &amp; notes</Text>
          </div>
        </div>

        <BatchPicker
          batches={batchCards}
          loading={loading}
          icon={<ReadOutlined />}
          accentFrom={ACCENT_FROM}
          accentTo={ACCENT_TO}
          countNoun={(n) => `${n} subject${n === 1 ? "" : "s"}`}
          onSelect={(batchId) => {
            const b = batches.find((x) => x.id === batchId);
            push({ mode: "subjects", batchId, batchName: b?.name ?? "Batch" });
          }}
          empty={
            <Empty description="No batches yet. Create a batch first, then add subjects.">
              <Button type="primary" onClick={() => router.push("/admin/batches/new")}>
                Create a batch
              </Button>
            </Empty>
          }
        />
      </PageContainer>
    );
  }

  // ---- Level 2: a batch's subjects (folders) ----
  if (current.mode === "subjects") {
    const batchSubjects = subjectsByBatch.get(current.batchId) ?? [];
    return (
      <PageContainer>
        <DrillHeader
          crumbs={[{ label: "All batches", onClick: back }, { label: current.batchName }]}
          title={current.batchName}
          subtitle={`${batchSubjects.length} subject${batchSubjects.length === 1 ? "" : "s"}`}
          icon={<ReadOutlined />}
          accentFrom={ACCENT_FROM}
          accentTo={ACCENT_TO}
          onBack={back}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                subjectForm.resetFields();
                setSubjectOpen(true);
              }}
            >
              Add subject
            </Button>
          }
        />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : batchSubjects.length === 0 ? (
          <Card>
            <Empty description="No subjects in this batch yet.">
              <Button
                type="primary"
                onClick={() => {
                  subjectForm.resetFields();
                  setSubjectOpen(true);
                }}
              >
                Add your first subject
              </Button>
            </Empty>
          </Card>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            }}
          >
            {batchSubjects.map((s) => {
              const count = notesBySubject.get(s.id)?.length ?? s.note_count ?? 0;
              return (
                <Card
                  key={s.id}
                  hoverable
                  className="tap"
                  styles={{ body: { padding: 18 } }}
                  style={{ borderRadius: 16 }}
                  onClick={() =>
                    push({
                      mode: "notes",
                      batchId: current.batchId,
                      batchName: current.batchName,
                      subjectId: s.id,
                      subjectName: s.name,
                    })
                  }
                >
                  <Flex align="center" gap={12}>
                    <FolderOpenOutlined style={{ fontSize: 26, color: ACCENT_TO }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text strong ellipsis style={{ display: "block", fontSize: 15.5 }}>
                        {s.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12.5 }}>
                        {count} note{count === 1 ? "" : "s"}
                      </Text>
                    </div>
                    <RightOutlined style={{ color: "rgba(148,163,184,0.9)", fontSize: 13 }} />
                  </Flex>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add subject */}
        <Modal
          title={`Add subject — ${current.batchName}`}
          open={subjectOpen}
          onCancel={() => {
            setSubjectOpen(false);
            subjectForm.resetFields();
          }}
          onOk={handleAddSubject}
          okText="Add"
          confirmLoading={subjectSaving}
          destroyOnHidden
        >
          <Form form={subjectForm} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item
              name="name"
              label="Subject name"
              rules={[{ required: true, message: "A subject name is required." }]}
            >
              <Input placeholder="e.g. Physics" maxLength={120} />
            </Form.Item>
          </Form>
        </Modal>
      </PageContainer>
    );
  }

  // ---- Level 3: a subject's notes ----
  const notes = notesBySubject.get(current.subjectId) ?? [];
  return (
    <PageContainer>
      <DrillHeader
        crumbs={[
          { label: "All batches", onClick: () => jumpTo(0) },
          { label: current.batchName, onClick: back },
          { label: current.subjectName },
        ]}
        title={current.subjectName}
        subtitle={`${notes.length} note${notes.length === 1 ? "" : "s"} · ${current.batchName}`}
        icon={<FolderOpenOutlined />}
        accentFrom={ACCENT_FROM}
        accentTo={ACCENT_TO}
        onBack={back}
        extra={
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                notesForm.resetFields();
                setFileList([]);
                setNotesOpen(true);
              }}
            >
              Add notes
            </Button>
            <Popconfirm
              title="Delete this subject?"
              description="All its notes and files will be permanently removed."
              okText="Delete"
              okButtonProps={{ danger: true, loading: busyId === current.subjectId }}
              onConfirm={() => handleDeleteSubject(current.subjectId)}
            >
              <Button danger icon={<DeleteOutlined />}>
                Delete subject
              </Button>
            </Popconfirm>
          </Space>
        }
      />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : notes.length === 0 ? (
        <Card>
          <Empty description="No notes in this subject yet.">
            <Button
              type="primary"
              onClick={() => {
                notesForm.resetFields();
                setFileList([]);
                setNotesOpen(true);
              }}
            >
              Add notes
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card style={{ borderRadius: 14 }}>
          <List
            dataSource={notes}
            rowKey="id"
            renderItem={(m) => {
              const first = m.files[0];
              return (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="del"
                      title="Delete this note?"
                      okText="Delete"
                      okButtonProps={{ danger: true, loading: busyId === m.id }}
                      onConfirm={() => handleDeleteNote(m)}
                    >
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                        Delete
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      isImageMime(first?.mime_type) ? (
                        <FileImageOutlined style={{ fontSize: 22, color: "#0ea5e9" }} />
                      ) : (
                        <FilePdfOutlined style={{ fontSize: 22, color: "#dc2626" }} />
                      )
                    }
                    title={m.title}
                    description={
                      <div>
                        {m.description ? (
                          <Text type="secondary" style={{ fontSize: 12.5, display: "block" }}>
                            {m.description}
                          </Text>
                        ) : null}
                        <Space direction="vertical" size={4} style={{ marginTop: 6, width: "100%" }}>
                          {m.files.length === 0 ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              No files.
                            </Text>
                          ) : (
                            m.files.map((f) => (
                              <Flex key={f.id} align="center" gap={8} wrap>
                                <Text style={{ fontSize: 12.5 }} ellipsis>
                                  {f.file_name}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11.5 }}>
                                  {formatFileSize(f.file_size)}
                                </Text>
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<EyeOutlined />}
                                  onClick={() => openFile(m.id, f.id, "view")}
                                >
                                  View
                                </Button>
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  onClick={() => openFile(m.id, f.id, "download")}
                                >
                                  Download
                                </Button>
                              </Flex>
                            ))
                          )}
                        </Space>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      )}

      {/* Add notes */}
      <Modal
        title={`Add notes — ${current.subjectName}`}
        open={notesOpen}
        onCancel={() => {
          setNotesOpen(false);
          notesForm.resetFields();
          setFileList([]);
        }}
        onOk={handleAddNotes}
        okText="Add"
        confirmLoading={notesSaving}
        destroyOnHidden
      >
        <Form form={notesForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: "A title is required." }]}
          >
            <Input placeholder="e.g. Chapter 3 — Kinematics" maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={3} maxLength={1000} placeholder="A short note about this material" />
          </Form.Item>
          <Form.Item label="Files (PDF or image)" required>
            <Upload
              accept={ACCEPT_ATTR}
              maxCount={MAX_FILES_PER_ITEM}
              multiple
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(0, MAX_FILES_PER_ITEM))}
              onRemove={(f) => setFileList((prev) => prev.filter((x) => x.uid !== f.uid))}
            >
              <Button icon={<UploadOutlined />}>Select files</Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>
              PDF or image (PNG, JPG, WebP, GIF), up to {MAX_FILE_LABEL} each — up to {MAX_FILES_PER_ITEM} files.
            </Text>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}

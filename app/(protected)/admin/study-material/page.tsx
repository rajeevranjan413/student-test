"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Select,
  Space,
  Spin,
  Tag,
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
  UploadOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  ACCEPT_ATTR,
  MAX_FILE_BYTES,
  formatFileSize,
  isAcceptedFile,
  isImageMime,
  type StudyMaterial,
  type Subject,
} from "@/utils/studyMaterial";

const { Title, Text } = Typography;

type BatchOption = { id: string; name: string };
type NotesTarget = { subjectId: string; subjectName: string };

/**
 * Admin Study Material (F13 / D25): a teacher adds SUBJECTS to a batch, then files
 * notes (PDF or image, title + description) under a subject. Students see the
 * batch's subjects as folders. Uploads go through `POST /api/study-materials`
 * (multipart, `subjectId`); files live in a private bucket reached only via
 * server-minted signed URLs.
 */
export default function AdminStudyMaterialPage() {
  const { message } = App.useApp();
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState<string | undefined>();

  // Add-subject modal
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectForm] = Form.useForm();

  // Add-notes modal (opened from a subject card)
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [notesForm] = Form.useForm();

  const [busyId, setBusyId] = useState<string | null>(null);

  // loading is toggled false only after the awaited fetches (never synchronously
  // in the effect) so this is safe to call from an effect.
  const loadData = useCallback(async (batch?: string) => {
    try {
      const q = batch ? `?batch=${encodeURIComponent(batch)}` : "";
      const [sRes, mRes] = await Promise.all([
        fetch(`/api/subjects${q}`),
        fetch(`/api/study-materials${q}`),
      ]);
      if (sRes.ok) setSubjects(await sRes.json());
      if (mRes.ok) setMaterials(await mRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(filterBatch);
  }, [loadData, filterBatch]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/batches");
      if (res.ok) {
        const data = await res.json();
        setBatches(
          (data as { id: string; name: string }[]).map((b) => ({
            id: b.id,
            name: b.name,
          }))
        );
      }
    })();
  }, []);

  const notesBySubject = useMemo(() => {
    const map = new Map<string, StudyMaterial[]>();
    for (const m of materials) {
      if (!m.subject_id) continue;
      const list = map.get(m.subject_id) ?? [];
      list.push(m);
      map.set(m.subject_id, list);
    }
    return map;
  }, [materials]);

  const openFile = async (id: string, mode: "view" | "download") => {
    try {
      const res = await fetch(`/api/study-materials/${id}/download?mode=${mode}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url)
        throw new Error(data.error || "Could not open the file");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not open the file");
    }
  };

  const handleAddSubject = async () => {
    let values: { name: string; batchId: string };
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
        body: JSON.stringify({ name: values.name, batchId: values.batchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add subject");
      message.success("Subject added.");
      setSubjectOpen(false);
      subjectForm.resetFields();
      loadData(filterBatch);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not add subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const handleDeleteSubject = async (s: Subject) => {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/subjects/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete subject");
      message.success("Subject deleted.");
      loadData(filterBatch);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete subject");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddNotes = async () => {
    if (!notesTarget) return;
    let values: { title: string; description?: string };
    try {
      values = await notesForm.validateFields();
    } catch {
      return;
    }
    const raw = fileList[0];
    const file = (raw?.originFileObj ?? raw) as File | undefined;
    if (!file) {
      message.error("Please select a PDF or image file.");
      return;
    }
    if (!isAcceptedFile(file.type || "", file.name || "")) {
      message.error("Only PDF or image files are allowed.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      message.error("File is too large (max 25 MB).");
      return;
    }

    setNotesSaving(true);
    try {
      const body = new FormData();
      body.append("title", values.title);
      body.append("subjectId", notesTarget.subjectId);
      if (values.description) body.append("description", values.description);
      body.append("file", file);

      const res = await fetch("/api/study-materials", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");

      message.success("Notes added.");
      setNotesTarget(null);
      notesForm.resetFields();
      setFileList([]);
      loadData(filterBatch);
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

  return (
    <PageContainer>
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
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Study Material
          </Title>
          <Text type="secondary">
            Organize notes by subject for each batch — students open a subject to
            see all its notes.
          </Text>
        </div>
        <Space wrap>
          <Select
            allowClear
            placeholder="All batches"
            style={{ minWidth: 180 }}
            value={filterBatch}
            onChange={(v) => {
              setLoading(true);
              setFilterBatch(v);
            }}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              subjectForm.resetFields();
              if (filterBatch) subjectForm.setFieldValue("batchId", filterBatch);
              setSubjectOpen(true);
            }}
          >
            Add subject
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : subjects.length === 0 ? (
        <Card>
          <Empty description="No subjects yet. Add a subject to start sharing notes.">
            <Button
              type="primary"
              onClick={() => {
                subjectForm.resetFields();
                if (filterBatch) subjectForm.setFieldValue("batchId", filterBatch);
                setSubjectOpen(true);
              }}
            >
              Add your first subject
            </Button>
          </Empty>
        </Card>
      ) : (
        <Flex vertical gap={16}>
          {subjects.map((s) => {
            const notes = notesBySubject.get(s.id) ?? [];
            return (
              <Card key={s.id} styles={{ body: { padding: 16 } }}>
                <Flex
                  align="center"
                  justify="space-between"
                  gap={12}
                  wrap
                  style={{ marginBottom: notes.length ? 12 : 0 }}
                >
                  <Space align="center">
                    <FolderOpenOutlined
                      style={{ fontSize: 22, color: "#4f46e5" }}
                    />
                    <div>
                      <Text strong style={{ fontSize: 16 }}>
                        {s.name}
                      </Text>
                      <div>
                        {s.batch_name ? <Tag>{s.batch_name}</Tag> : null}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {notes.length} note{notes.length === 1 ? "" : "s"}
                        </Text>
                      </div>
                    </div>
                  </Space>
                  <Space wrap>
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => {
                        notesForm.resetFields();
                        setFileList([]);
                        setNotesTarget({ subjectId: s.id, subjectName: s.name });
                      }}
                    >
                      Add notes
                    </Button>
                    <Popconfirm
                      title="Delete this subject?"
                      description="All its notes and files will be permanently removed."
                      okText="Delete"
                      okButtonProps={{ danger: true, loading: busyId === s.id }}
                      onConfirm={() => handleDeleteSubject(s)}
                    >
                      <Button danger icon={<DeleteOutlined />}>
                        Delete
                      </Button>
                    </Popconfirm>
                  </Space>
                </Flex>

                {notes.length > 0 ? (
                  <List
                    size="small"
                    dataSource={notes}
                    rowKey="id"
                    renderItem={(m) => (
                      <List.Item
                        actions={[
                          <Button
                            key="view"
                            type="link"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => openFile(m.id, "view")}
                          >
                            View
                          </Button>,
                          <Button
                            key="dl"
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => openFile(m.id, "download")}
                          >
                            Download
                          </Button>,
                          <Popconfirm
                            key="del"
                            title="Delete this note?"
                            okText="Delete"
                            okButtonProps={{
                              danger: true,
                              loading: busyId === m.id,
                            }}
                            onConfirm={() => handleDeleteNote(m)}
                          >
                            <Button type="link" size="small" danger>
                              Delete
                            </Button>
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            isImageMime(m.mime_type) ? (
                              <FileImageOutlined
                                style={{ fontSize: 20, color: "#0ea5e9" }}
                              />
                            ) : (
                              <FilePdfOutlined
                                style={{ fontSize: 20, color: "#dc2626" }}
                              />
                            )
                          }
                          title={m.title}
                          description={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {m.description ? `${m.description} · ` : ""}
                              {formatFileSize(m.file_size)}
                            </Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    No notes in this subject yet.
                  </Text>
                )}
              </Card>
            );
          })}
        </Flex>
      )}

      {/* Add subject */}
      <Modal
        title="Add subject"
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
          <Form.Item
            name="batchId"
            label="Batch"
            rules={[{ required: true, message: "Select a batch." }]}
          >
            <Select
              placeholder="Select a batch"
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add notes */}
      <Modal
        title={
          notesTarget ? `Add notes — ${notesTarget.subjectName}` : "Add notes"
        }
        open={!!notesTarget}
        onCancel={() => {
          setNotesTarget(null);
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
            <Input.TextArea
              rows={3}
              maxLength={1000}
              placeholder="A short note about this material"
            />
          </Form.Item>
          <Form.Item label="File (PDF or image)" required>
            <Upload
              accept={ACCEPT_ATTR}
              maxCount={1}
              beforeUpload={() => false}
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
              onRemove={() => setFileList([])}
            >
              <Button icon={<UploadOutlined />}>Select file</Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>
              PDF or image (PNG, JPG, WebP, GIF), up to 25 MB.
            </Text>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}

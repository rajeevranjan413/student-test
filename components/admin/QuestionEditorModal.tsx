"use client";

import { useMemo, useState } from "react";
import { App, Button, Modal, Radio, Segmented, Space, Typography, Upload } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { RichTextInput } from "@/components/admin/RichTextInput";
import { isBlankContent, isImageContent } from "@/utils/richText";

const { Text } = Typography;

export const OPTION_KEYS = ["A", "B", "C", "D"] as const;

/** Max inline image size — bounds the data-URI weight stored on the row (D31). */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_LABEL = "2 MB";

export type EditorOption = { key: string; text: string };
export type EditableQuestion = {
  uid: string;
  text: string;
  options: EditorOption[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

type Mode = "text" | "image";

/** Read a picked/pasted image File into a `data:` URI, validating type + size. */
function useImagePicker(onData: (dataUri: string) => void) {
  const { message } = App.useApp();
  return (file: File): boolean => {
    if (!file.type.startsWith("image/")) {
      message.error("Choose an image file (PNG, JPG, WebP, GIF).");
      return false;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      message.error(`Image must be ${MAX_IMAGE_LABEL} or smaller.`);
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => onData(String(reader.result));
    reader.onerror = () => message.error("Could not read that image.");
    reader.readAsDataURL(file);
    return false; // never auto-upload — we keep the data URI client-side
  };
}

/** Drag / click / paste an image; shows a preview with a remove button once set. */
function ImageField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (dataUri: string) => void;
  hint: string;
}) {
  const pick = useImagePicker(onChange);

  if (value) {
    return (
      <div>
        {/* Local data-URI preview; not a candidate for next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Selected"
          style={{ maxWidth: "100%", borderRadius: 8, display: "block", marginBottom: 8 }}
        />
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange("")}>
          Remove image
        </Button>
      </div>
    );
  }

  return (
    <div
      onPaste={(e) => {
        const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (file) {
          e.preventDefault();
          pick(file);
        }
      }}
    >
      <Upload.Dragger accept="image/*" beforeUpload={pick} showUploadList={false} maxCount={1}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Click, drag, or paste an image here</p>
        <p className="ant-upload-hint">{hint}</p>
      </Upload.Dragger>
    </div>
  );
}

/**
 * Shared manual question editor (D31) used by the test wizard, test edit page, and
 * homework create page. The question and explanation each switch between a **Text**
 * tab (bold + lists → HTML) and an **Image** tab (a screenshot stored as a data URI);
 * the four options stay plain text. Content is written back into the existing
 * `text`/`explanation` string fields, so the `POST /api/tests|homework` contract is
 * unchanged. Parent remounts this per question via `key`, so state seeds from props.
 */
export function QuestionEditorModal({
  question,
  isNew = false,
  itemNoun = "test",
  onCancel,
  onSave,
}: {
  question: EditableQuestion;
  isNew?: boolean;
  /** "test" | "homework" — only shapes the confirm button label. */
  itemNoun?: string;
  onCancel: () => void;
  onSave: (q: EditableQuestion) => void;
}) {
  const { message } = App.useApp();

  // Seed each field's mode + value from the stored content shape.
  const seedIsImage = isImageContent(question.text);
  const [qMode, setQMode] = useState<Mode>(seedIsImage ? "image" : "text");
  const [qText, setQText] = useState(seedIsImage ? "" : question.text);
  const [qImage, setQImage] = useState(seedIsImage ? question.text : "");

  const explSeed = question.explanation ?? "";
  const explIsImage = isImageContent(explSeed);
  const [eMode, setEMode] = useState<Mode>(explIsImage ? "image" : "text");
  const [eText, setEText] = useState(explIsImage ? "" : explSeed);
  const [eImage, setEImage] = useState(explIsImage ? explSeed : "");

  const [options, setOptions] = useState<EditorOption[]>(() =>
    OPTION_KEYS.map((k) => question.options.find((o) => o.key === k) ?? { key: k, text: "" })
  );
  const [correct, setCorrect] = useState(question.correctOptionKey || "A");

  const questionValue = qMode === "image" ? qImage : qText;
  const explanationValue = eMode === "image" ? eImage : eText;

  const modeSwitch = (mode: Mode, set: (m: Mode) => void) => (
    <Segmented
      size="small"
      value={mode}
      onChange={(v) => set(v as Mode)}
      options={[
        { label: "Text", value: "text" },
        { label: "Image", value: "image" },
      ]}
    />
  );

  const handleOk = () => {
    if (isBlankContent(questionValue)) {
      message.error(
        qMode === "image" ? "Add a question image." : "Enter the question text."
      );
      return;
    }
    const trimmedOptions = options.map((o) => ({ ...o, text: o.text.trim() }));
    if (trimmedOptions.some((o) => !o.text)) {
      message.error("Fill in all four options.");
      return;
    }
    onSave({
      ...question,
      text: questionValue.trim(),
      options: trimmedOptions,
      correctOptionKey: correct,
      // Blank explanation (either tab) is stored as no explanation.
      explanation: isBlankContent(explanationValue) ? "" : explanationValue.trim(),
    });
  };

  return (
    <Modal
      open
      width={640}
      title={isNew ? "Add question" : "Edit question"}
      onCancel={onCancel}
      onOk={handleOk}
      okText={isNew ? `Add to ${itemNoun}` : "Save"}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* Question */}
        <div>
          <FieldHeader label="Question" extra={modeSwitch(qMode, setQMode)} />
          {qMode === "text" ? (
            <RichTextInput
              value={qText}
              onChange={setQText}
              placeholder="Type the question — use bold or lists as needed."
            />
          ) : (
            <ImageField
              value={qImage}
              onChange={setQImage}
              hint="Horizontal question screenshots are fine — they scale to fit."
            />
          )}
        </div>

        {/* Options (plain text) */}
        <div>
          <FieldHeader label="Options" hint="Select the correct answer." />
          <Radio.Group
            value={correct}
            onChange={(e) => setCorrect(e.target.value)}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {options.map((o, i) => (
                <OptionRow
                  key={o.key}
                  option={o}
                  isCorrect={correct === o.key}
                  onText={(text) => {
                    const copy = [...options];
                    copy[i] = { ...o, text };
                    setOptions(copy);
                  }}
                />
              ))}
            </Space>
          </Radio.Group>
        </div>

        {/* Explanation */}
        <div>
          <FieldHeader
            label="Explanation"
            hint="Optional."
            extra={modeSwitch(eMode, setEMode)}
          />
          {eMode === "text" ? (
            <RichTextInput
              value={eText}
              onChange={setEText}
              placeholder="Optional — explain the answer."
              minHeight={72}
            />
          ) : (
            <ImageField
              value={eImage}
              onChange={setEImage}
              hint="Add a worked-solution / explanation screenshot."
            />
          )}
        </div>
      </Space>
    </Modal>
  );
}

function FieldHeader({
  label,
  hint,
  extra,
}: {
  label: string;
  hint?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 6,
      }}
    >
      <Text strong>
        {label}
        {hint && (
          <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
            {hint}
          </Text>
        )}
      </Text>
      {extra}
    </div>
  );
}

function OptionRow({
  option,
  isCorrect,
  onText,
}: {
  option: EditorOption;
  isCorrect: boolean;
  onText: (text: string) => void;
}) {
  // A tidy, consistent row: correct-answer radio + letter badge + input, with the
  // whole row tinted when it's the selected answer.
  const tint = useMemo(
    () => ({
      borderColor: isCorrect ? "var(--primary)" : "var(--border)",
      background: isCorrect ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
    }),
    [isCorrect]
  );

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        border: "1px solid",
        borderRadius: 8,
        cursor: "pointer",
        transition: "border-color 0.15s ease, background 0.15s ease",
        ...tint,
      }}
    >
      <Radio value={option.key} />
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          flex: "0 0 24px",
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          fontWeight: 700,
          fontSize: 13,
          color: isCorrect ? "var(--primary-foreground)" : "var(--foreground)",
          background: isCorrect ? "var(--primary)" : "var(--muted)",
        }}
      >
        {option.key}
      </span>
      <input
        value={option.text}
        onChange={(e) => onText(e.target.value)}
        placeholder={`Option ${option.key}`}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--foreground)",
          fontSize: 14,
        }}
      />
    </label>
  );
}

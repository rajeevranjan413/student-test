"use client";

import { useEffect, useRef } from "react";
import { Button, Space, Tooltip } from "antd";
import {
  BoldOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";

/**
 * A minimal `contentEditable` rich-text field for question / explanation text (D31):
 * bold + bullet/numbered lists, emitting the small HTML subset `sanitizeHtml`
 * understands. Uncontrolled after mount (the DOM owns the text) so the caret never
 * jumps; `onChange` lifts the current `innerHTML` on every edit. `document.execCommand`
 * is deprecated but still universally supported and is the zero-dependency way to do
 * basic formatting.
 */
export function RichTextInput({
  value,
  onChange,
  placeholder,
  minHeight = 96,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed the editable once from `value`; thereafter the DOM is the source of truth.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value ?? "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  // onMouseDown + preventDefault keeps the editor's selection while the toolbar
  // button is pressed (a plain click would blur the field first and lose it).
  const toolbarBtn = (title: string, icon: React.ReactNode, command: string) => (
    <Tooltip title={title}>
      <Button
        size="small"
        type="text"
        icon={icon}
        aria-label={title}
        onMouseDown={(e) => {
          e.preventDefault();
          exec(command);
        }}
      />
    </Tooltip>
  );

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      <Space size={2} style={{ padding: 6, borderBottom: "1px solid var(--border)" }}>
        {toolbarBtn("Bold", <BoldOutlined />, "bold")}
        {toolbarBtn("Bullet list", <UnorderedListOutlined />, "insertUnorderedList")}
        {toolbarBtn("Numbered list", <OrderedListOutlined />, "insertOrderedList")}
      </Space>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        className="rte-editable"
        onInput={emit}
        style={{ minHeight, padding: "8px 12px", outline: "none" }}
      />
    </div>
  );
}

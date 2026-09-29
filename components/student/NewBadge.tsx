"use client";

import { Tag } from "antd";
import { StarFilled, ClockCircleFilled } from "@ant-design/icons";
import type { SeenStatus } from "@/utils/whatsNew";

/**
 * A small "New" / "Updated" tag for a student list card (F16). Renders nothing when
 * the item has already been seen, so callers can drop it in unconditionally.
 */
export function NewBadge({ status }: { status: SeenStatus | undefined }) {
  if (status === "new")
    return (
      <Tag color="green" icon={<StarFilled />} style={{ marginInlineEnd: 0 }}>
        New
      </Tag>
    );
  if (status === "updated")
    return (
      <Tag color="orange" icon={<ClockCircleFilled />} style={{ marginInlineEnd: 0 }}>
        Updated
      </Tag>
    );
  return null;
}

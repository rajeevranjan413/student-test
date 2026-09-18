"use client";

import { useRouter } from "next/navigation";
import { Card, Carousel, Flex, Tag, Typography } from "antd";
import {
  FileTextOutlined,
  ReadOutlined,
  RightOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";
import { PageContainer } from "@/components/layout/PageContainer";

const { Title, Text } = Typography;

/**
 * Student home — the landing screen after a student signs in (F12).
 *
 * A banner slider (top) followed by section cards that route into features.
 * Home is presentational only: no API, no schema, no server logic — every
 * security-critical rule stays in the F6 endpoints the Tests card links to.
 */

// Placeholder banner creatives. The maintainer will replace each `src` with a
// real image URL — this array is the single place to edit. Kept as remote URLs
// (not bundled assets) so swapping them is a one-line change per slide.
const BANNERS: { src: string; alt: string }[] = [
  { src: "https://picsum.photos/seed/nc-banner-1/1200/420", alt: "Banner 1" },
  { src: "https://picsum.photos/seed/nc-banner-2/1200/420", alt: "Banner 2" },
  { src: "https://picsum.photos/seed/nc-banner-3/1200/420", alt: "Banner 3" },
  { src: "https://picsum.photos/seed/nc-banner-4/1200/420", alt: "Banner 4" },
  { src: "https://picsum.photos/seed/nc-banner-5/1200/420", alt: "Banner 5" },
  { src: "https://picsum.photos/seed/nc-banner-6/1200/420", alt: "Banner 6" },
];

type Section = {
  key: string;
  title: string;
  desc: string;
  icon: ComponentType;
  color: string;
  href?: string; // present = active; absent = coming soon
};

// Tests is live today; Homework and Study Material are placeholders for features
// the maintainer will add later (rendered disabled with a "Coming soon" tag).
const SECTIONS: Section[] = [
  {
    key: "tests",
    title: "Tests",
    desc: "Attempt your scheduled tests and view results.",
    icon: FileTextOutlined,
    color: "#2563eb",
    href: "/student/tests",
  },
  {
    key: "homework",
    title: "Homework",
    desc: "Assignments from your teacher.",
    icon: SolutionOutlined,
    color: "#7c3aed",
    href: "/student/homework",
  },
  {
    key: "study",
    title: "Study Material",
    desc: "Notes, PDFs and resources.",
    icon: ReadOutlined,
    color: "#059669",
    href: "/student/study-material",
  },
];

export default function StudentHome() {
  const router = useRouter();

  return (
    <PageContainer max={960}>
      {/* Banner slider */}
      <Carousel autoplay autoplaySpeed={4000} draggable adaptiveHeight={false}>
        {BANNERS.map((b) => (
          <div key={b.src}>
            <div
              role="img"
              aria-label={b.alt}
              style={{
                aspectRatio: "1200 / 420",
                width: "100%",
                borderRadius: 12,
                backgroundImage: `url(${b.src})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "rgba(0,0,0,0.04)",
              }}
            />
          </div>
        ))}
      </Carousel>

      {/* Section cards */}
      <Title level={4} style={{ marginTop: 28, marginBottom: 4 }}>
        Explore
      </Title>
      <Text type="secondary">Jump into your coaching activities.</Text>

      <Flex wrap gap={16} style={{ marginTop: 16 }}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = Boolean(s.href);
          return (
            <Card
              key={s.key}
              hoverable={active}
              onClick={() => s.href && router.push(s.href)}
              style={{
                flex: "1 1 220px",
                minWidth: 200,
                opacity: active ? 1 : 0.6,
                cursor: active ? "pointer" : "default",
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Flex align="flex-start" justify="space-between" gap={12}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${s.color}1a`,
                    color: s.color,
                    fontSize: 22,
                  }}
                >
                  <Icon />
                </span>
                {active ? (
                  <RightOutlined style={{ color: "#9ca3af" }} />
                ) : (
                  <Tag color="default" style={{ marginInlineEnd: 0 }}>
                    Coming soon
                  </Tag>
                )}
              </Flex>
              <Text strong style={{ display: "block", fontSize: 16, marginTop: 14 }}>
                {s.title}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {s.desc}
              </Text>
            </Card>
          );
        })}
      </Flex>
    </PageContainer>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, Carousel, Flex, Tag, Typography } from "antd";
import {
  FileTextOutlined,
  ReadOutlined,
  RightOutlined,
  SolutionOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PushToggle } from "@/components/pwa/PushToggle";
import {
  countUnseen,
  type NewItem,
  type WhatsNewSection,
} from "@/utils/whatsNew";

const { Title, Text } = Typography;

/**
 * Student home — the landing screen after a student signs in (F12).
 *
 * A banner slider (top) followed by section cards that route into features.
 * Home is presentational only: no API, no schema, no server logic — every
 * security-critical rule stays in the F6 endpoints the Tests card links to.
 */

// Banner creatives — real Neeraj Competitive Classes photos bundled under
// public/home/*. This array is the single place to edit; local (not remote) so
// the PWA can serve them offline. Swap a file or path to change a slide.
const BANNERS: { src: string; alt: string }[] = [
  { src: "/home/hero.jpg", alt: "Neeraj Competitive Classes — felicitation ceremony" },
  { src: "/home/toppers.jpg", alt: "Celebrating a medal-winning student" },
  { src: "/home/banner.jpg", alt: "Our coaching center" },
  { src: "/home/felicitation.jpg", alt: "Celebrating a student's success" },
  { src: "/home/teachers-day.jpg", alt: "Teacher's Day at Neeraj Competitive Classes" },
  { src: "/home/award.jpg", alt: "Awarding a hard-working student" },
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

// The whats-new endpoint's payload — activity signatures per section (F16).
type WhatsNew = Record<WhatsNewSection, NewItem[]>;

export default function StudentHome() {
  const router = useRouter();
  // Unseen (new + updated) counts per section — the alert badges on the cards.
  const [counts, setCounts] = useState<Partial<Record<WhatsNewSection, number>>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/student/whats-new");
        if (!res.ok) return;
        const data = (await res.json()) as WhatsNew;
        setCounts({
          tests: countUnseen("tests", data.tests ?? []),
          homework: countUnseen("homework", data.homework ?? []),
          study: countUnseen("study", data.study ?? []),
        });
      } catch {
        // Best-effort: no badges if the signal can't be fetched.
      }
    })();
  }, []);

  return (
    <PageContainer max={960}>
      {/* Greeting */}
      <Flex vertical style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Welcome back 👋
        </Title>
        <Text type="secondary">
          Neeraj Competitive Classes · No game · No fame · Only aim
        </Text>
      </Flex>

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

      {/* Opt-in push notifications (F15) — hidden where unsupported/unconfigured */}
      <PushToggle />

      {/* Section cards */}
      <Title level={4} style={{ marginTop: 28, marginBottom: 4 }}>
        Explore
      </Title>
      <Text type="secondary">Jump into your coaching activities.</Text>

      <Flex wrap gap={16} style={{ marginTop: 16 }}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = Boolean(s.href);
          const alert = counts[s.key as WhatsNewSection] ?? 0;
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
                <Badge count={active ? alert : 0} overflowCount={99} offset={[2, -2]}>
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
                </Badge>
                {active ? (
                  <Flex align="center" gap={8}>
                    {alert > 0 && (
                      <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
                        {alert} new
                      </Tag>
                    )}
                    <RightOutlined style={{ color: "#9ca3af" }} />
                  </Flex>
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

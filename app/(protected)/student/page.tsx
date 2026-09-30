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

type Banner = { url: string; alt: string };

// Bundled default creatives (public/home/*) — shown until the admin configures
// custom banners at /admin/settings (F17), and as an offline fallback. The live
// list comes from GET /api/student/banners, which returns these same defaults when
// no custom banners are set. Keep this in sync with that route's DEFAULT_BANNERS.
const DEFAULT_BANNERS: Banner[] = [
  { url: "/home/hero.jpg", alt: "Neeraj Competitive Classes — felicitation ceremony" },
  { url: "/home/toppers.jpg", alt: "Celebrating a medal-winning student" },
  { url: "/home/banner.jpg", alt: "Our coaching center" },
  { url: "/home/felicitation.jpg", alt: "Celebrating a student's success" },
  { url: "/home/teachers-day.jpg", alt: "Teacher's Day at Neeraj Competitive Classes" },
  { url: "/home/award.jpg", alt: "Awarding a hard-working student" },
];

type Section = {
  key: string;
  title: string;
  desc: string;
  icon: ComponentType;
  color: string; // primary accent (badges/tags)
  from: string; // gradient start
  to: string; // gradient end
  href?: string; // present = active; absent = coming soon
};

// Tests is live today; Homework and Study Material are placeholders for features
// the maintainer will add later (rendered disabled with a "Coming soon" tag).
// Each section carries its own two-stop gradient so the cards read as a colourful,
// coherent set (blue → homework violet → study emerald).
const SECTIONS: Section[] = [
  {
    key: "tests",
    title: "Tests",
    desc: "Attempt your scheduled tests and view results.",
    icon: FileTextOutlined,
    color: "#2563eb",
    from: "#3b82f6",
    to: "#4f46e5",
    href: "/student/tests",
  },
  {
    key: "homework",
    title: "Homework",
    desc: "Assignments from your teacher.",
    icon: SolutionOutlined,
    color: "#7c3aed",
    from: "#8b5cf6",
    to: "#d946ef",
    href: "/student/homework",
  },
  {
    key: "study",
    title: "Study Material",
    desc: "Notes, PDFs and resources.",
    icon: ReadOutlined,
    color: "#059669",
    from: "#10b981",
    to: "#0d9488",
    href: "/student/study-material",
  },
];

// The whats-new endpoint's payload — activity signatures per section (F16).
type WhatsNew = Record<WhatsNewSection, NewItem[]>;

export default function StudentHome() {
  const router = useRouter();
  // Unseen (new + updated) counts per section — the alert badges on the cards.
  const [counts, setCounts] = useState<Partial<Record<WhatsNewSection, number>>>({});
  // Banner slides — start with the bundled defaults, then swap in the admin's
  // configured slides once fetched (F17). Falls back to defaults on any error.
  const [banners, setBanners] = useState<Banner[]>(DEFAULT_BANNERS);

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

    (async () => {
      try {
        const res = await fetch("/api/student/banners");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.banners) && data.banners.length > 0) {
          setBanners(data.banners as Banner[]);
        }
      } catch {
        // Best-effort: keep the bundled defaults if the fetch fails.
      }
    })();
  }, []);

  return (
    <PageContainer max={960}>
      {/* Gradient welcome hero */}
      <div
        className="stu-hero"
        style={{ padding: "clamp(20px, 5vw, 32px)", marginBottom: 20 }}
      >
        <span className="stu-hero-pill">✨ No game · No fame · Only aim</span>
        <Title
          level={2}
          style={{ color: "#fff", margin: "14px 0 2px", fontWeight: 800, letterSpacing: "-0.02em" }}
        >
          Welcome back 👋
        </Title>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 15 }}>
          Neeraj Competitive Classes — let&rsquo;s make today count.
        </Text>
      </div>

      {/* Banner slider */}
      <Carousel autoplay autoplaySpeed={4000} draggable adaptiveHeight={false}>
        {banners.map((b) => (
          <div key={b.url}>
            <div
              role="img"
              aria-label={b.alt}
              style={{
                aspectRatio: "1200 / 420",
                width: "100%",
                borderRadius: 16,
                backgroundImage: `url(${b.url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "rgba(0,0,0,0.04)",
                boxShadow: "0 14px 34px -20px rgba(16,24,40,0.4)",
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
              className={active ? "stu-card" : undefined}
              hoverable={active}
              onClick={() => s.href && router.push(s.href)}
              style={{
                flex: "1 1 220px",
                minWidth: 200,
                opacity: active ? 1 : 0.6,
                cursor: active ? "pointer" : "default",
                // Section palette for the accent bar + hover glow (see globals.css).
                ["--a" as string]: s.from,
                ["--b" as string]: s.to,
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Flex align="flex-start" justify="space-between" gap={12}>
                <Badge count={active ? alert : 0} overflowCount={99} offset={[2, -2]}>
                  <span
                    className="stu-tile"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      fontSize: 23,
                      ["--a" as string]: s.from,
                      ["--b" as string]: s.to,
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

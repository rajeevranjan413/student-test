import Link from "next/link";
import {
  GraduationCap,
  Presentation,
  Trophy,
  Sparkles,
  Users,
  CalendarClock,
  BookOpen,
  ClipboardCheck,
  BadgeCheck,
  ArrowRight,
  Phone,
  MapPin,
} from "lucide-react";
import { InstallAppButton } from "@/components/pwa/InstallApp";

/**
 * Public coaching-center home page (the `/` landing). Authed users are bounced to
 * their dashboard by middleware, so everyone who sees this is a visitor deciding
 * whether to sign in / enroll. Student & Teacher sign-in are kept as small buttons
 * (header + closing CTA); the page itself sells the coaching center.
 *
 * ─── Images ────────────────────────────────────────────────────────────────────
 * Drop real photos into `public/home/` and they light up automatically (each slot
 * has a gradient fallback so the page looks finished even with no images yet):
 *   public/home/hero.jpg      → hero showcase (right of the headline)
 *   public/home/classroom.jpg → gallery: a class in session
 *   public/home/banner.jpg    → gallery: center / building / banner
 *   public/home/toppers.jpg   → gallery: results / toppers
 * Recommended size ~1200×800, JPG/WebP. They are rendered as CSS backgrounds
 * (background-image) rather than <img>, both to keep the graceful gradient
 * fallback and to avoid the next/no-img-element lint (same approach as F12).
 */

// Center branding — single source of truth for the landing page. Values come
// from Neeraj Competitive Classes' own banners/photos (public/org). Adjust the
// stat figures to the center's current numbers before going live.
const CENTER_NAME = "Neeraj Competitive Classes";
const CENTER_TAGLINE = "Competitive Exam Coaching";
const CENTER_MOTTO = "No game · No fame · Only aim";
const CENTER_RUN_BY = "Run by Neeraj Sir · Faculty of Patna";
const CENTER_PHONE = "+91 78705 79213";
const CENTER_ADDRESS = "Near Sanichar Bazar, Ambedkar Nagar, Bihar";

const STATS = [
  { value: "Govt-job", label: "Focused batches" },
  { value: "Police · Army", label: "Selections & counting" },
  { value: "Railway · SSC", label: "Exam-pattern practice" },
  { value: "Weekly", label: "Tests + leaderboard" },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI-generated tests",
    body: "Fresh, exam-pattern papers created from our teachers' own notes — new practice every week.",
  },
  {
    icon: Presentation,
    title: "Faculty of Patna",
    body: "Learn from Neeraj Sir and an expert team who have guided hundreds into Police, Army & SSC.",
  },
  {
    icon: CalendarClock,
    title: "Structured batches",
    body: "Foundation, Railway Group-D & Police batches with fixed timings that fit school and college.",
  },
  {
    icon: Trophy,
    title: "Live leaderboard",
    body: "A public ranking after every test keeps the healthy competition — and the motivation — high.",
  },
];

const PROGRAMS = [
  {
    icon: BookOpen,
    title: "Foundation Batch",
    body: "Concept-first coaching for early aspirants building a strong base for Railway, SSC & Police.",
  },
  {
    icon: ClipboardCheck,
    title: "SSC GD · Railway Group-D",
    body: "Full-length, timed mock tests for SSC GD and Railway Group-D with instant scoring and review.",
  },
  {
    icon: BadgeCheck,
    title: "Bihar Police · Daroga",
    body: "Focused preparation and high-yield practice for Bihar Police, Daroga (SI) & Defence exams.",
  },
];

/** A gallery tile: shows the photo if present, otherwise a branded gradient. */
function GalleryTile({
  src,
  label,
  className = "",
}: {
  src: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent ${className}`}
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-90" />
      <span className="absolute bottom-3 left-4 text-sm font-semibold text-white drop-shadow">
        {label}
      </span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight sm:text-lg">
                {CENTER_NAME}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {CENTER_TAGLINE}
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <Trophy className="h-4 w-4" /> Results
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Decorative brand glow */}
        <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Admissions open — new Foundation &amp; Group-D batches
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Crack Railway, SSC, Bank &amp; Police exams with{" "}
              <span className="text-primary">expert guidance</span>
            </h1>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-primary/80">
              {CENTER_MOTTO}
            </p>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              {CENTER_NAME} blends the Faculty of Patna with AI-powered practice
              tests and a live leaderboard — so every aspirant knows exactly where
              they stand and how to improve.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Enroll now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                <Trophy className="h-4 w-4" /> View leaderboard
              </Link>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Already with us?{" "}
              <Link href="/login/student" className="font-semibold text-primary hover:underline">
                Student login
              </Link>{" "}
              ·{" "}
              <Link href="/login/teacher" className="font-semibold text-primary hover:underline">
                Teacher login
              </Link>
            </p>
          </div>

          {/* Hero showcase image (gradient fallback until public/home/hero.jpg exists) */}
          <div
            className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-primary/5 to-transparent shadow-xl"
            style={{
              backgroundImage: "url(/home/hero.jpg)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/50 to-transparent p-5">
              <div className="rounded-xl bg-background/90 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-lg font-extrabold text-primary">Faculty of Patna</p>
                <p className="text-xs text-muted-foreground">Experienced mentors</p>
              </div>
              <div className="rounded-xl bg-background/90 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-lg font-extrabold text-primary">Police · Army</p>
                <p className="text-xs text-muted-foreground">Real selections</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-primary sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why choose us ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Why students choose us</h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to prepare smarter — under one roof.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Gallery ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3 sm:grid-rows-2 sm:[grid-template-areas:'a_a_b''a_a_c']">
          <GalleryTile
            src="/home/banner.jpg"
            label="Our coaching center"
            className="min-h-56 sm:[grid-area:a]"
          />
          <GalleryTile
            src="/home/classroom.jpg"
            label="Daily classes in session"
            className="min-h-44 sm:[grid-area:b]"
          />
          <GalleryTile
            src="/home/toppers.jpg"
            label="Celebrating our toppers"
            className="min-h-44 sm:[grid-area:c]"
          />
        </div>
      </section>

      {/* ── Programs ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Our programs</h2>
          <p className="mt-3 text-muted-foreground">
            Pick the track that matches where you are in your journey.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PROGRAMS.map((p) => (
            <div
              key={p.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-7 shadow-sm"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <p.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.body}</p>
              <Link
                href="/signup"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Join this batch <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA (role buttons again, small) ────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 text-center sm:p-12">
          <Users className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to start your preparation?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Create your account with the enrollment code from your teacher, or sign in
            to continue.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Enroll now <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login/student"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              <GraduationCap className="h-4 w-4" /> Continue as Student
            </Link>
            <Link
              href="/login/teacher"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              <Presentation className="h-4 w-4" /> Continue as Teacher
            </Link>
          </div>

          <div className="mt-6 flex justify-center">
            <InstallAppButton />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="font-bold">{CENTER_NAME}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Guiding competitive-exam aspirants with expert mentoring and
              data-driven practice. {CENTER_MOTTO}.
            </p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {CENTER_RUN_BY}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Quick links</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/leaderboard" className="hover:text-primary">Leaderboard</Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-primary">Enroll / Sign up</Link>
              </li>
              <li>
                <Link href="/login/student" className="hover:text-primary">Student login</Link>
              </li>
              <li>
                <Link href="/login/teacher" className="hover:text-primary">Teacher login</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Get in touch</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> {CENTER_PHONE}
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> {CENTER_MOTTO}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> {CENTER_ADDRESS}
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {CENTER_NAME}. All rights reserved.
        </div>
      </footer>
    </main>
  );
}

import {
  Home,
  BookOpen,
  FileText,
  Users,
  Trophy,
  Library,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the app-shell navigation (Android-style top app bar
 * + bottom navigation). Shared by `AppBar` and `BottomNav` so tabs, titles, and
 * back-behaviour stay in sync. See docs/FEATURES.md → F11.
 */

export type Tab = { href: string; label: string; icon: LucideIcon };
export type Section = "admin" | "student" | "none";

export const ADMIN_TABS: Tab[] = [
  { href: "/admin", label: "Home", icon: Home },
  { href: "/admin/batches", label: "Batches", icon: BookOpen },
  { href: "/admin/quizzes", label: "Tests", icon: FileText },
  { href: "/admin/homework", label: "Homework", icon: ClipboardList },
  { href: "/admin/study-material", label: "Study", icon: Library },
  { href: "/admin/students", label: "Students", icon: Users },
];

export const STUDENT_TABS: Tab[] = [
  { href: "/student", label: "Home", icon: Home },
  { href: "/student/tests", label: "Tests", icon: FileText },
  { href: "/student/homework", label: "Homework", icon: ClipboardList },
  { href: "/student/study-material", label: "Study", icon: Library },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
];

/** Which chrome (if any) applies to a path. `/` and auth pages get no chrome. */
export function sectionFor(pathname: string): Section {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/student")) return "student";
  if (pathname === "/leaderboard") return "student";
  return "none";
}

export function tabsFor(pathname: string): Tab[] {
  const s = sectionFor(pathname);
  return s === "admin" ? ADMIN_TABS : s === "student" ? STUDENT_TABS : [];
}

/** Home destination for a section — used as the back-arrow fallback. */
export function homeFor(pathname: string): string {
  return sectionFor(pathname) === "admin" ? "/admin" : "/student";
}

/** A path is "top-level" when it is one of the bottom-nav tab destinations. */
export function isTopLevel(pathname: string): boolean {
  return [...ADMIN_TABS, ...STUDENT_TABS].some((t) => t.href === pathname);
}

const EXACT_TITLES: Record<string, string> = {
  "/admin": "Overview",
  "/admin/batches": "Batches",
  "/admin/batches/new": "New batch",
  "/admin/quizzes": "Tests",
  "/admin/quizzes/new": "New test",
  "/admin/homework": "Homework",
  "/admin/homework/new": "New homework",
  "/admin/students": "Students",
  "/admin/study-material": "Study Material",
  "/student": "Home",
  "/student/tests": "My Tests",
  "/student/homework": "Homework",
  "/student/study-material": "Study Material",
  "/leaderboard": "Leaderboard",
};

const DYNAMIC_TITLES: [RegExp, string][] = [
  [/^\/admin\/batches\/[^/]+\/edit$/, "Edit batch"],
  [/^\/admin\/batches\/[^/]+$/, "Batch"],
  [/^\/admin\/quizzes\/[^/]+$/, "Test"],
  [/^\/admin\/students\/[^/]+$/, "Student"],
  [/^\/student\/tests\/[^/]+$/, "Test"],
  [/^\/student\/homework\/[^/]+$/, "Homework"],
  [/^\/student\/study-material\/[^/]+$/, "Notes"],
];

/** Human title for the top app bar. Falls back to the brand name. */
export function titleFor(pathname: string): string {
  if (EXACT_TITLES[pathname]) return EXACT_TITLES[pathname];
  for (const [re, title] of DYNAMIC_TITLES) if (re.test(pathname)) return title;
  return "NeerajClasses";
}

/** Immersive flows (taking a test) hide the bottom nav to avoid mis-taps. */
export function isImmersive(pathname: string): boolean {
  return /^\/student\/tests\/[^/]+$/.test(pathname);
}

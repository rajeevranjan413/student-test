"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

type NavLink = { href: string; label: string };

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/batches", label: "Batches" },
  { href: "/admin/quizzes", label: "Tests" },
  { href: "/admin/students", label: "Students" },
];

const STUDENT_LINKS: NavLink[] = [
  { href: "/student", label: "My Tests" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Nav is role-aware: the section is derived from the current path, so students
  // never see admin links (and vice-versa). The role-select landing (/) is minimal.
  const isAdmin = pathname.startsWith("/admin");
  const isStudent = pathname.startsWith("/student");
  const links = isAdmin ? ADMIN_LINKS : isStudent ? STUDENT_LINKS : [];
  const homeHref = isAdmin ? "/admin" : isStudent ? "/student" : "/";
  const showLogout = isAdmin || isStudent;

  const isActive = (href: string) =>
    href === homeHref ? pathname === href : pathname.startsWith(href);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo & desktop navigation */}
        <div className="flex items-center gap-8">
          <Link href={homeHref} className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              NeerajCompetitiveClasses
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(l.href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {showLogout && (
            <button
              onClick={logout}
              disabled={loggingOut}
              className="hidden items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 sm:flex"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          )}

          {links.length > 0 && (
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && links.length > 0 && (
        <div className="border-b border-border bg-background p-4 shadow-sm md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(l.href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {showLogout && (
              <button
                onClick={logout}
                disabled={loggingOut}
                className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

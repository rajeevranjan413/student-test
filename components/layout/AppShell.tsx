"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, LogOut, MoreVertical } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { NCLogo } from "./NCLogo";
import { useBatches } from "@/components/providers/BatchProvider";
import {
  homeFor,
  isImmersive,
  isTopLevel,
  sectionFor,
  tabsFor,
} from "./appNav";

/**
 * Android-style app shell: a top app bar (back arrow on sub-screens, contextual
 * title, overflow menu) and a bottom navigation bar for top-level destinations.
 * Rendered once in the root layout so it persists across navigations (no flash)
 * and covers admin, student, and the public leaderboard. See docs/FEATURES.md → F11.
 */

const BAR = "h-14"; // 56px — Material top app bar height

async function logout(router: ReturnType<typeof useRouter>) {
  await fetch("/api/auth/logout", { method: "POST" });
  // The logout route reliably clears the session cookies, so a soft navigation
  // is enough here. `replace` (not push) drops the old dashboard from history so
  // Back can't return to a now-signed-out screen, and `refresh` invalidates the
  // RSC cache so switching to another account (teacher ↔ student) renders clean.
  router.replace("/login");
  router.refresh();
}

export function AppBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  // The app bar lives in the root layout and persists across soft navigations, so
  // its local state survives a sign-out → sign-in round trip. Reset the transient
  // bits when the route changes (render-phase reset, per the React docs) — otherwise
  // the overflow menu stays open showing a stale, disabled "Signing out…" button
  // after the next login.
  const [lastPath, setLastPath] = React.useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
    setLoggingOut(false);
  }

  const section = sectionFor(pathname);
  const tabs = tabsFor(pathname);
  const authed = pathname.startsWith("/admin") || pathname.startsWith("/student");

  const { batches, activeBatchId, setActiveBatchId } = useBatches();
  // Only students with more than one batch get a switcher (nothing to switch
  // between otherwise). It filters the student's test list by batch.
  const showBatchSwitcher = section === "student" && batches.length > 1;

  if (section === "none") return null; // no chrome on /, /login, /signup, /home

  const showBack = !isTopLevel(pathname);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(homeFor(pathname));
  };

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await logout(router);
    } catch {
      // Network error reaching the logout route — re-enable the button so the
      // user can retry rather than being stuck on "Signing out…".
      setLoggingOut(false);
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className={`mx-auto flex ${BAR} max-w-5xl items-center gap-1 px-2 sm:px-4`}>
        {/* Leading: back arrow (sub-screens) or brand mark (top-level) */}
        {showBack ? (
          <button
            onClick={goBack}
            aria-label="Back"
            className="tap flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        ) : (
          <span className="flex h-11 w-11 items-center justify-center text-primary">
            <NCLogo className="h-7 w-7" />
          </span>
        )}

        {/* Spacer — the changing page title was intentionally removed; the
            leading logo/back arrow is enough identity, and this keeps the
            trailing actions right-aligned. */}
        <div className="min-w-0 flex-1" />

        {/* Desktop inline tabs (mobile uses the bottom nav) */}
        <nav className="mr-1 hidden items-center gap-1 md:flex">
          {tabs.map((t) => {
            const active = isTopLevel(pathname)
              ? pathname === t.href
              : pathname.startsWith(t.href) && t.href !== homeFor(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Trailing actions */}
        {showBatchSwitcher && (
          <select
            aria-label="Switch batch"
            value={activeBatchId ?? ""}
            onChange={(e) => setActiveBatchId(e.target.value || null)}
            className="mr-1 max-w-[10rem] truncate rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? "Batch"}
              </option>
            ))}
          </select>
        )}
        <ThemeToggle />

        {authed && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              aria-expanded={menuOpen}
              className="tap flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                {/* click-away scrim */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                  <button
                    onClick={onLogout}
                    disabled={loggingOut}
                    className="tap flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {loggingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const tabs = tabsFor(pathname);

  if (tabs.length === 0 || isImmersive(pathname)) return null;

  const isActive = (href: string) =>
    isTopLevel(pathname)
      ? pathname === href
      : pathname.startsWith(href) && href !== homeFor(pathname);

  // Dynamically size indicators if tabs exceed 4
  const isDense = tabs.length > 4;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {tabs.map((t) => {
            const active = isActive(t.href);
            const Icon = t.icon;
            return (
              <li key={t.href} className="min-w-0 flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`tap flex flex-col items-center justify-center gap-0.5 py-1.5 text-center font-medium transition-colors ${
                    isDense ? "text-[10px]" : "text-[11px]"
                  } ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  <span
                    className={`flex items-center justify-center rounded-full transition-colors ${
                      isDense ? "h-7 w-11" : "h-8 w-14"
                    } ${active ? "bg-primary/12" : ""}`}
                  >
                    <Icon
                      className={isDense ? "h-4 w-4" : "h-5 w-5"}
                      strokeWidth={active ? 2.4 : 2}
                    />
                  </span>
                  <span className="w-full truncate px-0.5">
                    {t.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Spacer matching adjusted bar height (58px) + safe area */}
      <div
        className="md:hidden"
        style={{ height: "calc(58px + env(safe-area-inset-bottom))" }}
        aria-hidden
      />
    </>
  );
}

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("route-enter");
    // force reflow so the animation replays on every navigation
    void el.offsetWidth;
    el.classList.add("route-enter");
  }, [pathname]);

  return (
    <div ref={ref} className="route-enter">
      {children}
    </div>
  );
}

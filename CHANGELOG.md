# CHANGELOG

## 2026-09-17 — Redesign: public coaching-center home page (`/` landing)

Presentational only (Tailwind; no API/schema/server change). Replaced the bare
"select your role" chooser at `/` with a full coaching-center marketing home page.

**Changed**
- `app/(protected)/page.tsx` — new sections: sticky header, hero (headline +
  enroll/leaderboard CTAs + showcase image), stats strip, "Why choose us"
  features, campus gallery, programs, closing CTA, and footer with contact +
  quick links. **Student/Teacher sign-in kept as small buttons** in the header and
  the closing CTA (link to `/login/student` and `/login/teacher`); leaderboard link
  and the PWA install button retained.
- Image slots render as CSS `background-image` (same lint-safe pattern as F12) with
  branded gradient fallbacks, so the page looks finished with **no images yet**. Real
  photos drop into `public/home/{hero,classroom,banner,toppers}.jpg` and light up
  automatically — see `public/home/README.md`.
- `docs/ARCHITECTURE.md` — `/` route row updated to describe the new home page.

**Verified:** `npx tsc --noEmit`, `npx eslint app/(protected)/page.tsx`, and
`npx next build` all pass. Not click-tested live (no `.env`).

## 2026-09-17 — Fix: antd surfaces render white on hard reload in dark mode (F11)

Bug fix. On the installed PWA (and any hard reload) in **dark mode**, Ant Design
admin/student surfaces (cards, tables, panels) painted **white** on the dark page;
they only corrected after a client navigation. Root cause: `next-themes` can't
resolve the theme during SSR / the first client render, so antd's SSR styles are
always extracted in the **light** algorithm and stay light until the antd subtree
remounts (which a navigation did). See `docs/FEATURES.md F11 → Notes`.

**Changed**
- `components/providers/AntdProvider.tsx` — detect hydration with
  `useSyncExternalStore` (server/first-render `false`, then `true`); hold the light
  algorithm until mounted so hydration matches the SSR markup; then honour
  `resolvedTheme` and **key `ConfigProvider` by the mounted flag** so the antd tree
  remounts exactly once after hydration with the resolved theme — reproducing the
  navigation "fix" deterministically. The key is stable afterwards, so later theme
  toggles still update in place (no React state loss). No API/schema/contract change.

**Verified:** `npx tsc --noEmit` clean · `npx eslint components/providers/AntdProvider.tsx`
clean · `npx next build` passes.

## 2026-09-17 — Study Material: teacher PDF notes shared to a batch (F13)

New feature. A teacher shares study material with a batch; every enrolled student
can see it and download it. The first (today only) material **kind** is **Notes** —
a PDF with a title + description. Designed to be extensible (more kinds later) with
no migration. See `docs/FEATURES.md F13` and `DECISIONS.md D24`.

**Added**
- `supabase/migrations/20260917160000_study_materials.sql` — new `study_materials`
  table (metadata + object path; `kind` free-text, `archived_at` reserved) with RLS
  (teacher CRUD; student SELECT enrolled + non-archived), plus a **private**
  `study-material` Storage bucket (idempotent; guarded for bare-Postgres runs).
- `utils/studyMaterial.ts` — shared bucket name, size/type limits, `StudyMaterial`
  type, `formatFileSize`.
- API: `GET/POST /api/study-materials` (teacher: list / multipart PDF upload via
  service role, batch-ownership checked, orphan cleanup on failure),
  `DELETE /api/study-materials/[id]` (teacher: hard-delete object + row),
  `GET /api/study-materials/[id]/download` (teacher **or** enrolled student:
  authorizes then mints a ~60 s signed URL; `?mode=view|download`),
  `GET /api/student/study-materials` (student: enrolled, non-archived; opt. `?batch=`).
- Pages: `/admin/study-material` (antd — upload modal + list with View/Download/
  Delete + batch filter) and `/student/study-material` (antd — cards with View +
  Download; respects the header batch switcher).

**Changed**
- `components/layout/appNav.ts` — a **Study** tab for both admin and student
  sections + app-bar titles.
- `app/(protected)/student/page.tsx` — the F12 **Study Material** home card is now
  active (routes to `/student/study-material`); only **Homework** remains "Coming soon".
- Docs: `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/FEATURES.md` (F13),
  `DECISIONS.md` (D24) updated doc-first.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build` all
pass. Not click-tested live (no `.env`/Supabase Storage in the repo).

## 2026-09-17 — Skip login/chooser for signed-in users + fix stuck "Signing out…" (F1)

Two auth-UX fixes.

**Changed**
- `middleware.ts` — authed users who hit the `/` landing page (role chooser) are
  now redirected to their home page (teacher → `/admin`, student → `/student`),
  matching the existing `/login`/`/signup` behavior. A signed-in user never sees
  the sign-in / role-selection screens again.

**Fixed**
- `components/layout/AppShell.tsx` — the app bar persists across soft navigations,
  so after sign-out → sign-in the overflow menu stayed open showing a disabled
  "Signing out…" button. Now resets `menuOpen`/`loggingOut` on every route change.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build` all pass.

## 2026-09-17 — Multi-batch signup + header batch switcher (F1)

Students can now belong to several batches and move between them. See
`DECISIONS.md D23`. (Teacher add/remove of students already shipped in D14 —
`/admin/batches/[id]` — and is unchanged.)

**Added**
- `app/api/student/batches/route.ts` — `GET` the signed-in student's enrolled
  batches (RLS-scoped, public-safe fields only); powers the header switcher.
- `components/providers/BatchProvider.tsx` — client context holding enrolled
  batches + the active selection (localStorage-persisted, `null` = All). Fetches
  lazily only on `/student` routes; reconciles a stale selection to "All".
- Header **batch switcher** in `components/layout/AppShell.tsx` — a `<select>`
  shown only for students with >1 batch; filters the student dashboard.

**Changed**
- `app/api/auth/register/route.ts` — accepts `batchIds: string[]` (legacy single
  `batchId` still works); one enrollment code matching **any** selected batch (or
  the master override) enrolls the student in **all** selected batches.
- `app/signup/page.tsx` — single batch `<select>` → multi-select checkbox list;
  code field reworded ("for any one selected batch").
- `app/api/student/tests/route.ts` — each test row now carries `batch_id`.
- `app/(protected)/student/page.tsx` — filters the test list by the active batch.
- `app/layout.tsx` — wraps the app shell in `BatchProvider`.

**Verified:** `npx tsc --noEmit` clean. Not click-tested (no `.env` in repo).

## 2026-09-17 — Admin can edit & delete a test (F3 completion)

Completes F3: a teacher could create tests but not edit or remove them. See
`DECISIONS.md D22`.

**Added**
- `app/api/tests/[id]/route.ts` — `GET` (full test + questions incl. answer columns,
  read via the service-role client since they're SELECT-revoked; teacher-only,
  ownership → 404), `PUT` (update settings always; replace the question set only when
  the test has no attempts, else `409`), `DELETE` (hard-delete when unattempted so
  `questions` cascade; soft-archive via `archived_at` when attempts exist, preserving
  results/leaderboard history).
- `app/(protected)/admin/quizzes/[id]/edit/page.tsx` — antd edit screen: settings
  form + status control (draft/published/closed) + question editor (locked read-only
  with a notice once the test has attempts).
- `supabase/migrations/20260917140000_quiz_archive.sql` — additive/idempotent
  `quizzes.archived_at`; student `quizzes`/`questions` SELECT policies gain
  `archived_at IS NULL` so archived tests disappear from students.

**Changed**
- `app/api/tests/route.ts`: teacher list filters `archived_at IS NULL`.
- `app/(protected)/admin/quizzes/page.tsx` (list) and `.../[id]/page.tsx` (results):
  per-row / header **Edit** + **Delete** actions (Delete via `Popconfirm`; archive vs.
  permanent delete surfaced in the success message).

**Verified:** `npx tsc --noEmit`, `npx eslint` (quiz/test files), and `npx next build`
all pass. Not click-tested (no `.env`).

## 2026-09-17 — Remove "Exam / level" field from tests (create/edit + generate)

The "Exam / level" field was removed from the test lifecycle end to end. It is no
longer collected, stored, sent to the AI, or displayed anywhere. The batch
`exam_level` field is unrelated and unchanged.

**Changed**
- Create test wizard (`app/(protected)/admin/quizzes/new/page.tsx`) and edit test
  form (`.../quizzes/[id]/edit/page.tsx`): dropped the "Exam / level" select from
  Setup; Batch now spans full width. Removed `examLevel` from state/submit payloads
  and the confirm-step summary.
- `app/api/generate/route.ts`: stopped reading `examLevel`; the prompt no longer
  appends a level clause.
- Tests APIs (`app/api/tests/route.ts`, `.../[id]/route.ts`, `.../[id]/results/route.ts`)
  and student APIs (`app/api/student/tests/route.ts`, `.../[id]/route.ts`,
  `utils/studentTests.ts`): dropped `exam_level` from selects, request bodies,
  inserts/updates, and JSON responses.
- Display: removed the level Tag/row from the quizzes list, quiz detail, student
  test list, and student take page.
- `utils/constants.ts`: removed the now-unused `EXAM_LEVELS` list and `ExamLevel` type.
- Docs: `DATA-MODEL.md` marks `quizzes.exam_level` deprecated (column kept nullable
  for back-compat per the additive-migrations rule); `ARCHITECTURE.md §5`,
  `docs/FEATURES.md` (F3/F4), and `DECISIONS.md D6` updated.

**Verified:** `npx tsc --noEmit` clean; `npx eslint` clean on all changed files.

## 2026-09-17 — Tests startable anytime after schedule; teacher-close is the only lock (F6 / D21)

A student who misses a test's scheduled start can now take it any time afterward,
for as long as the test is published. The old time-based hard lock (grace window →
`missed`) is removed; the only thing that closes a test is the teacher setting it
`closed`. Late attempts are still flagged `is_late`.

**Changed**
- `utils/test.ts`: `computePhase(timing, now, status?)` returns `closed` only when the
  quiz status is `closed` (was: `now ≥ closesAt`); `open` stays true indefinitely after
  `scheduled_at`. `personalDeadline(startedAt, duration)` drops the `closesAt` cap — a
  late starter gets their full `duration_minutes`. Header/`deriveOutcome` comments updated.
- API routes thread the quiz's `status` into `computePhase` and drop the `timing` arg
  from `personalDeadline`: `app/api/student/tests/[id]/start`, `.../submit`,
  `.../[id]` (GET+PATCH), `app/api/student/tests`, `app/api/tests/[id]/results`,
  `app/api/students/[id]` (now also selects `status`).
- `utils/constants.ts`: `LATE_GRACE_MINUTES` documented as informational only (still
  computes the reporting `closesAt = due + grace`; no longer gates starting).
- Student UI copy: take-page "closed" screen now says the teacher closed the test.

**Docs** — `docs/DATA-MODEL.md` (timing model), `docs/FEATURES.md` (F6 rewrite + F7 note),
`DECISIONS.md` (D21).

**Verified** — `tsc --noEmit` clean, `eslint` clean on changed files, `next build` succeeds.
No schema/migration change; API JSON stayed additive-compatible (`closes_at` retained).

## 2026-09-17 — Separate student/teacher login pages (F1)

The single `/login` page with an in-form student/teacher toggle is replaced by
dedicated, single-purpose sign-in pages.

**Added**
- `app/login/student/page.tsx` and `app/login/teacher/page.tsx` — role-specific
  sign-in forms (no toggle). Student page keeps the "Register here" link; teacher
  page adds a "Student login" cross-link.
- `app/login/_components/LoginForm.tsx` — shared client form; the role is fixed
  by the page and the icon is derived from it. The server still returns the
  user's actual role, so redirect always lands on the correct dashboard.

**Changed**
- `app/login/page.tsx` is now a chooser routing to `/login/student` or
  `/login/teacher`; the role toggle is gone.
- Docs: `docs/FEATURES.md` (F1) and `docs/ARCHITECTURE.md` route table updated.

**Verified** — `tsc --noEmit` clean, `eslint` clean on changed files, `next build`
succeeds (all three login routes prerender). `middleware.ts` already treats every
`/login*` path as an auth route, so no gating change was needed.

## 2026-09-17 — Batch class timing replaces course field (F2 / D20)

A batch is now defined by *when it meets* (start/end time-of-day) instead of a
free-text course name.

**Added**
- Migration `supabase/migrations/20260917120000_batch_timing.sql` — additive &
  idempotent: adds `batches.start_time` / `batches.end_time` (`TIME`,
  `ADD COLUMN IF NOT EXISTS`) and drops the `NOT NULL` on the now-deprecated
  `course` column (kept in place for back-compat; nothing reads it).
- `utils/batch.ts` — `formatBatchTiming(start,end)` → `"6:00 AM – 8:00 AM"` and
  `toTimeInputValue()`; shared by every screen that shows a batch.

**Changed**
- APIs: `POST`/`GET /api/batches`, `PUT /api/batches/[id]`, `GET /api/public/batches`
  (public list now `id,name,start_time,end_time`), and the batch join in
  `GET /api/students/[id]` — `course` swapped for `start_time`/`end_time`; create
  now requires both times.
- UI: batch create (Tailwind `<input type="time">` ×2) & edit (antd
  `<Input type="time">` ×2), batch list & detail, admin dashboard, student detail,
  and the batch `<Select>` labels on the leaderboard, signup, and quiz wizard now
  show the formatted timing range.

**Verified:** `npx tsc --noEmit`, `npx eslint <changed files>`, and `npx next build`
all pass. Not click-tested live (no `.env`; needs Supabase keys + the new migration
applied).

## 2026-09-16 — Android-native app shell: bottom nav + top app bar (F11)

Follow-up to the PWA work: the whole app now runs inside an Android-style app
shell so the installed app feels native rather than like a website.

**Added**
- `components/layout/appNav.ts` — single source of truth for nav tabs, route
  titles, section detection, and back/immersive rules.
- `components/layout/AppShell.tsx` — `AppBar` (Material top app bar: back arrow on
  sub-screens, contextual title, ⋮ overflow menu with theme toggle + Sign out),
  `BottomNav` (role-aware bottom navigation, mobile-only, safe-area aware, hidden
  during a test attempt), and `RouteTransition` (page enter animation).
- App-shell CSS in `app/globals.css`: `.tap` press feedback, `route-enter`
  keyframes, tap-highlight removal, disabled page rubber-band — reduced-motion aware.

**Changed**
- `app/layout.tsx` — renders the shell once (persists across navigations, no flash),
  covering admin, student, and the public leaderboard.
- `app/(protected)/layout.tsx` — dropped the old top nav; the shell lives in root.
- `app/(protected)/page.tsx` — role picker self-centres (`min-h-dvh`) now that the
  bar is external.

**Removed**
- `components/layout/Header.tsx` (web-style hamburger `TopNav`) — replaced by the
  app shell.

**Verified**
- `npx tsc --noEmit` clean; `npx eslint` clean on changed files; `npx next build`
  passes. Live click-through needs Supabase keys (none in repo).

## 2026-09-16 — Installable Android app (PWA) + home-page install link (F11)

The web app is now installable as an Android app via the browser's PWA flow —
no native binary. Android Chrome offers **Install app / Add to Home Screen**, and
it launches full-screen (standalone) like a native app. A **Get / Install Android
app** button was added to the home page: it fires the native install prompt when
the browser reports the app is installable, shows short Android/iOS steps
otherwise, and confirms "App installed" once running standalone.

**Added**
- `app/manifest.ts` — web app manifest (`/manifest.webmanifest`): name, 192/512
  icons + a 512 maskable, `display: standalone`, `theme_color #4f46e5`.
- `public/sw.js` — dependency-free service worker: fetch handler required for
  installability + a small app-shell cache. **Never** caches `/api/*`, `/auth`, or
  cross-origin, so Supabase data/sessions stay live and F10 answer-secrecy holds.
- `public/icon-192.png`, `public/icon-512.png` — generated graduation-cap icons.
- `components/pwa/InstallApp.tsx` — `PwaRegister` (registers SW + captures the
  install prompt app-wide) and `InstallAppButton` (home-page control).

**Changed**
- `app/layout.tsx` — mounts `<PwaRegister />`; adds PWA metadata (apple-web-app,
  icons) and `viewport.themeColor`.
- `app/(protected)/page.tsx` — renders `<InstallAppButton />` under the role picker.

**Docs**
- `docs/FEATURES.md` F11 entry + index; `docs/ARCHITECTURE.md` PWA row.

**Verified**
- `npx tsc --noEmit` clean; `npx next build` passes; `/manifest.webmanifest` and
  `/sw.js` serve 200; icons render.

## 2026-09-16 — Mobile responsiveness: card layout for table views

Phones previously had to scroll table views sideways to reach later columns. Tables
now render as a stacked card list below the `md` breakpoint (768px) while keeping the
full AntD table on desktop. No API/schema change; behaviour on desktop is unchanged.

**Added**
- `components/layout/ResponsiveTable.tsx` — drop-in wrapper for AntD `<Table>`. On
  desktop it is a pass-through (all props forwarded, sorting/filtering/pagination
  intact); below the breakpoint it renders each row as a `<Card>` (first column as the
  heading, remaining columns as label → value rows) from the *same* `columns`/
  `dataSource`. Preserves `onRow` click-through, `loading`, and `locale.emptyText`.
  SSR-safe: first render is the desktop table, then it switches after mount (no
  hydration mismatch).

**Changed**
- Swapped `<Table>` → `<ResponsiveTable>` in the six AntD table screens: admin
  students list + detail, tests list + results, batch detail (students & tests),
  and the public leaderboard.
- `app/(protected)/admin/batches/page.tsx` — the raw HTML table now has a parallel
  mobile card list (`md:hidden`); the table shows from `md` up.
- `app/(protected)/admin/batches/[id]/page.tsx` — moved the "add student" Select+Add
  out of the card `extra` header (a fixed 240px control that overflowed the title on
  phones) into a wrapping flex in the card body; the batch title row now wraps.

Verified: `npx tsc --noEmit` clean · `npx eslint` on changed files clean ·
`npx next build` passes.

## 2026-09-15 — F3: manual question entry in the test wizard

Admins can now author a question + its options by hand, alongside (or instead of)
AI generation. Doc-first: `docs/FEATURES.md` F3 + `docs/ARCHITECTURE.md` route table
updated before code.

**Changed**
- `app/(protected)/admin/quizzes/new/page.tsx` — added **Add question manually**
  entry points on the Generate step (with an "or" divider, so a test needs no image)
  and the Review step header/empty-state. Reuses the existing `EditQuestionModal`,
  now driven by an `isNew` flag (dynamic title + "Add to test" CTA). Manual
  questions are **auto-approved** — the teacher authored them, so they land directly
  in the approved list (removable there) rather than the review queue; the Review
  shortcut on the Generate step also surfaces the pending AI-candidate count.
- `EditQuestionModal` now **validates** before save (non-empty question text + all
  four options) for both add and edit.

**Unchanged**
- No schema/API change — manual questions use the same
  `{text, options[4], correctOptionKey, explanation?, difficulty?}` shape and the
  existing `POST /api/tests` contract.

Verified: `npx tsc --noEmit` clean · `npx eslint` on the changed file clean ·
`npx next build` passes.

## 2026-09-15 — UI audit: consistent, premium, mobile-first pass (DECISIONS D17)

Cross-cutting UI polish across every page. No feature/behaviour/API change; no
system swaps (Tailwind pages stay Tailwind, antd pages stay antd per AGENTS §2).

**Fixed**
- `app/globals.css` — the design-token set was incomplete: only `background`/
  `foreground`/`primary` were mapped, so Tailwind classes the pages already used
  (`text-muted-foreground`, `border-border`, `bg-muted`, `text-primary-foreground`,
  `bg-card`, `focus:ring-ring`) silently resolved to nothing. Added the full
  light+dark token palette (zinc neutrals + brand blue) and a base `border-color`,
  which repairs the look of `login`, `signup`, `/admin/batches`, `/admin/batches/new`
  and the header in one change.

**Changed**
- `components/layout/Header.tsx` — now **role-aware** (links derive from the current
  path: admin vs student vs minimal on `/`), mobile-first (hamburger only when links
  exist, active-state styling), with a **working Sign-out** (was missing though the
  `/api/auth/logout` route existed). Removed the dead `/admin/settings` link and the
  no-op notification bell.
- `components/layout/PageContainer.tsx` (new) — shared wrapper giving every antd
  admin/student screen one max-width and a fluid mobile-first gutter
  (`clamp(16px,4vw,24px)`), replacing per-page hardcoded `padding:24`/`maxWidth`.
  Adopted by all antd pages (admin dashboard, quizzes, students, batch/student/test
  detail, batch edit, test wizard, student dashboard, take-test, leaderboard).
- Mobile-first tables: `scroll={{ x: "max-content" }}` on every antd `Table`, and the
  `/admin/batches` raw table now scrolls (`overflow-x-auto` + `min-w`) instead of
  clipping (`overflow-hidden`). Tailwind form/list pages got responsive padding
  (`p-4 sm:p-6 lg:p-8`) and wrapping headers.
- `app/(protected)/student/page.tsx` — dropped a hardcoded `rgba(0,0,0,.45)` that was
  near-invisible in dark mode (antd `Text type="secondary"` handles it).
- `app/(protected)/admin/batches/new/page.tsx` — fixed its pre-existing `catch (e:any)`
  lint error since the file became part of this diff.

**Not touched (flagged):** legacy `app/home/page.tsx` (browser-write quiz builder,
already slated for retirement) — off-brand colours / no dark mode; left as-is to avoid
touching the deprecated direct-write flow.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build` all
pass. Visual/dark-mode click-through needs your own Supabase keys.

## 2026-09-15 — Admin dashboard + retire mock /teacher (DECISIONS D16 / F9)

Completed F9 (Admin dashboard) — the last feature item in the backlog.

**Added**
- `app/(protected)/admin/page.tsx` — real antd dashboard replacing the one-line stub:
  `Statistic` cards (batches, students, published tests / total) + recent-batches and
  recent-tests lists (click through to detail/results) + New batch/test actions. Data
  from existing `GET /api/batches` (D14 counts), `GET /api/students`, `GET /api/tests`,
  fetched in parallel. No new API.

**Changed**
- `app/(protected)/teacher/page.tsx` — retired the hardcoded mock (MOCK_BATCHES/
  MOCK_QUIZZES + `alert()`); now `redirect()`s to `/admin` so the landing "Teacher"
  card lands on the real dashboard (unauthed → middleware → `/login`).
- Docs: `FEATURES.md` (F9 → ✅), `ARCHITECTURE.md` (route map: `/admin` live,
  `/teacher` retired), `DECISIONS.md` D16.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build` all
pass. Live click-through needs your own Supabase keys.

## 2026-09-15 — Public leaderboard (DECISIONS D15 / F8)

Completed F8 (Public leaderboard) — the next item from the DECISIONS backlog.

**Added**
- `GET /api/public/leaderboard` — no-auth ranking via the **service role** (RLS would
  otherwise hide other students' attempts/profiles). Returns only public-safe fields
  (`full_name` + aggregate scores). Metric: total points (Σ `score` over `submitted`
  attempts), tie-broken by overall accuracy (Σ `correct_count` / Σ questions in taken
  tests, using a real question-count denominator) then earliest submission. Optional
  `?batch=<id>` filter.
- `app/leaderboard/page.tsx` — antd ranked `Table` (rank + top-3 medals, name, points,
  tests, accuracy) with a batch `Select`. Public route, **outside** `(protected)` so
  middleware lets it through with no session.

**Changed**
- `app/(protected)/page.tsx` (landing) — added a "View public leaderboard" link.
- Docs: `FEATURES.md` (F8 → ✅, F1 leaderboard box ticked), `ARCHITECTURE.md` (route +
  API tables), `DECISIONS.md` D15 + trimmed open items.

**Verified:** `npx tsc --noEmit`, `npx eslint` (new files), `npx next build` all pass.
Live click-through needs your own Supabase keys.

## 2026-09-15 — Batch detail/edit + enroll UI (DECISIONS D14 / F2)

Completed F2 (Batch management) — the next item from the DECISIONS backlog.

**Added**
- `app/(protected)/admin/batches/[id]/page.tsx` — antd batch detail hub: info card +
  roll-up stats, enrolled-students table with **add** (`Select` of unenrolled
  students) / **remove** (`Popconfirm`), and the batch's tests (row → results).
- `app/(protected)/admin/batches/[id]/edit/page.tsx` — antd edit form → `PUT
  /api/batches/[id]` (resolves the list's previously-dead Edit link).
- `POST`/`DELETE /api/batches/[id]/students` — enroll/remove a student via the
  **service role** (no browser write policy on `student_batches`, D11); guards
  `requireTeacher` + batch ownership + student role; enroll idempotent (`23505`).

**Changed**
- `GET /api/batches` — additive `student_count` / `test_count` per batch.
- `GET /api/batches/[id]` — additive `students` (with email/phone via
  `contactsById`), `available_students`, and `tests`; PUT/DELETE unchanged.
- `app/(protected)/admin/batches/page.tsx` (Tailwind) — Students/Tests count columns
  + name links to the detail page; typed the row + escaped a stray apostrophe.
- Docs: `FEATURES.md` (F2 → ✅), `ARCHITECTURE.md` (route + API tables),
  `DATA-MODEL.md` (RLS note), `DECISIONS.md` D14 + trimmed open items.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build`
all pass. Live click-through needs your own Supabase keys.

## 2026-09-15 — Admin students roster + detail (DECISIONS D13 / F5)

Added the admin "Students" screens — the next item from the DECISIONS backlog.

**Added**
- `GET /api/students` — teacher-only roster: every `role='student'` profile with
  enrolled batches, #tests submitted, last activity, and **email/phone pulled from
  `auth.users` via the service role** (`utils/students.ts`). Contact details are
  teacher-only, never returned to a student.
- `GET /api/students/[id]` — student detail: profile + contact + enrolled batches +
  full test history across all published tests in those batches (so missed tests
  surface), each with on-time/late/missed outcome + score, plus roll-up stats.
- `utils/students.ts` — service-role email/phone lookup (paged `listUsers`, capped).
- `app/(protected)/admin/students/page.tsx` — antd roster table with text search
  (name/email/phone) + batch filter; row → detail.
- `app/(protected)/admin/students/[id]/page.tsx` — antd profile + stats + history.

**Changed**
- `utils/test.ts` — new pure `deriveOutcome(attempt, phase)` (the
  on_time/late/in_progress/expired/missed/pending vocabulary), so F5 history and F7
  reporting derive outcomes from one implementation.
- `app/api/tests/[id]/results/route.ts` — uses the shared `deriveOutcome` (removed
  its local copy).
- Docs: `FEATURES.md` (F5 → ✅), `ARCHITECTURE.md` (route map + API table + key
  files), `DECISIONS.md` D13 + trimmed open items.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build`
all pass. Live click-through needs your own Supabase keys.

## 2026-09-15 — Admin late/missed reporting (DECISIONS D12 / F7)

Added per-test results reporting so an admin can see who was on-time, late, or
missed, with scores — the first item from the DECISIONS "next passes" backlog.

**Added**
- `GET /api/tests/[id]/results` — teacher-only, verifies test ownership (404
  otherwise). Reports **every enrolled student** in the test's batch (left-joined
  to `quiz_attempts`), so non-attempters show as `missed`/`pending`. Outcome is
  derived server-side from the attempt + window phase (`on_time`/`late`/
  `in_progress`/`expired`/`missed`/`pending`) via `utils/test.ts`; returns roll-up
  counts + average score. Read-only — no answer columns touched.
- `app/(protected)/admin/quizzes/[id]/page.tsx` — antd results screen: roll-up
  stat cards + filterable/sortable table (student, status, started/submitted,
  score + %, pass/fail).

**Changed**
- `app/(protected)/admin/quizzes/page.tsx` — added a **View results** action per
  row linking to the new report.
- Docs: `FEATURES.md` (F7 → ✅, plus F6 marked ✅ to reflect the shipped take-test
  flow and the actual `/api/student/tests/*` route names), `ARCHITECTURE.md` route
  map (results + student endpoints), `DECISIONS.md` D12 + trimmed open items.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build`
all pass. Live click-through needs your own Supabase keys.

## 2026-09-15 — Row-Level Security + answer confidentiality (DECISIONS D11 / F10)

Backed the API-layer access control with Supabase RLS. Previously RLS was off and
every user-scoped Route Handler used the same anon key + user JWT as the browser,
so a signed-in student could query Supabase directly and read
`questions.correct_answer` — or write their own `quiz_attempts` (a forged score).

**Added**
- `supabase/migrations/20260915140000_enable_rls.sql` — enable RLS on all six
  tables with policies mirroring the API model; `is_teacher()` / `is_enrolled()`
  SECURITY DEFINER helpers; column-REVOKE `questions.correct_answer` +
  `explanation` from `anon`/`authenticated`; `secret_pass` revoked from `anon`.
  Additive & idempotent (helpers `CREATE OR REPLACE`, policies drop-then-create).
- `utils/supabase/admin.ts` — server-only service-role client (bypasses RLS +
  column grants) for the two privileged operations below.

**Changed**
- `utils/studentTests.ts` — `loadScorableQuestions` and `finalizeAttempt` now use
  the service-role client (answer reads + attempt writes); dropped their
  user-scoped `supabase` parameter.
- `app/api/student/tests/[id]/{route,start,submit}` — all `quiz_attempts`
  inserts/updates routed through the service-role client (the browser JWT has no
  write policy); updated `finalizeAttempt`/`loadScorableQuestions` call sites.

**Effect**
- No browser/user session can read answer columns or write attempts — closing
  both the answer-confidentiality leak and client-side score tampering. User-scoped
  reads (take payload, question counts, dashboards, batch CRUD, wizard) still work
  via the new SELECT policies.

**Verified:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build`
all pass. Live RLS behaviour needs your own Supabase keys (see `docs/FEATURES.md`
F10 for the manual check).

## 2026-09-15 — Student take-test flow (spec §3.5)

Implemented the end-to-end student take-test flow on top of the attempt-lifecycle
schema groundwork from the previous pass.

**Added**
- `supabase/migrations/20260915130000_widen_attempt_scores.sql` — widen
  `quiz_attempts.score`/`max_score` to `NUMERIC` so fractional negative marking is
  stored exactly (additive, backward-compatible).
- `utils/test.ts` — pure, server-authoritative timing + scoring: `computeTiming`,
  `computePhase`, `personalDeadline`, `isLateSubmission`, `scoreAttempt`,
  `normalizeOptions`.
- `utils/studentTests.ts` — server-only helpers that gate access (published +
  enrolled batch), load public vs. scorable questions, build post-submit review,
  and `finalizeAttempt` (the single authoritative scoring/finalize path).
- `utils/constants.ts` — `LATE_GRACE_MINUTES` (15) grace window.
- `utils/auth.ts` — `requireStudent` guard.
- API: `GET /api/student/tests` (dashboard list), `GET`/`PATCH
  /api/student/tests/[id]` (bootstrap + autosave, lazy auto-submit),
  `POST /api/student/tests/[id]/start`, `POST /api/student/tests/[id]/submit`.
- UI: `/student` dashboard (tests by phase + attempt state, scores) and
  `/student/tests/[id]` take page (pre-start, countdown auto-submit, debounced
  autosave, single-attempt lock, graded review) — antd.

**Enforced server-side**
- **Window lock:** start/submit only while `now ∈ [scheduled_at, scheduled_at +
  duration + grace)`; upcoming → 403, closed → 403/missed.
- **Single attempt:** `UNIQUE(quiz_id, student_id)` + status guards; a submitted
  attempt can never be re-scored; start is idempotent (resume).
- **Timer:** per-student deadline = `min(started_at + duration, hard-close)`;
  client countdown auto-submits, server caps effective submit time at the deadline.
- **Late flag:** `is_late = submitted_at > (scheduled_at + duration)`.
- **Server scoring:** correct answers are read only during scoring/review, never
  sent to the client before submission.

**Verified:** `tsc --noEmit`, `eslint`, and `next build` all pass. Full e2e not
run (no Supabase/Gemini keys in the workspace).

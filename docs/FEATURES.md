# Features

> One entry per feature. Each has **Goal / UI / Rules / Acceptance / Status /
> Code**. This is the doc-first backlog: to change or add a feature, update the
> relevant entry here (and `ARCHITECTURE.md` / `DATA-MODEL.md` if contracts move)
> **before** writing code. Status legend: ✅ done · 🟡 partial · 🔴 pending.

Feature index:

| # | Feature | Status |
|---|---|---|
| F1 | Authentication & roles | ✅ |
| F2 | Batch management | ✅ |
| F3 | AI test-creation wizard | ✅ |
| F4 | AI question generation (endpoint) | ✅ |
| F5 | View all students | ✅ |
| F6 | Student — take a test | ✅ |
| F7 | Late / missed reporting | ✅ |
| F8 | Public leaderboard | ✅ |
| F9 | Admin dashboard | ✅ |
| F10 | RLS & data confidentiality | ✅ |
| F11 | Installable Android app (PWA) | ✅ |
| F12 | Student home page (banner + sections) | ✅ |
| F13 | Study Material (subject folders → notes: PDF/image) | ✅ |
| F14 | Homework (batch-wise: MCQ attempt + PDF/image mark-done) | ✅ |
| F15 | Student push notifications (homework · tests · study material) | 🟡 |

---

## F1 — Authentication & roles  ✅

**Goal:** Role-aware access; teacher (=admin) vs student, plus public pages.

**UI:** `/login` (chooser: Student vs Teacher), `/login/student` and
`/login/teacher` (separate, single-purpose sign-in forms — no in-form role
toggle), `/signup` (student self-register: **pick one or more batches** via a
checkbox list + enter the enrollment code for **any one** of them), logout in
header. Students enrolled in more than one batch get a **batch switcher** in the
app header (see D23). *(Tailwind — existing.)*

**Rules:**
- `middleware.ts` gates `/admin/*` (teacher) and `/student/*` (authed); redirects
  authed users off `/login`/`/signup` **and the `/` landing page** to their home
  page (teacher → `/admin`, student → `/student`), so a signed-in user never sees
  the sign-in / role-chooser screens.
- Teacher bootstrapped from `TEACHER_EMAIL`/`TEACHER_PASSWORD` (auto-provisioned on
  first login).
- **Student self-registration is gated by a per-batch `secret_pass`** (the
  enrollment code the teacher hands out — see `DATA-MODEL.md → batches.secret_pass`),
  **not** a single global secret. A student may select **multiple** batches and
  enter **one** code; the register route (service-role) rejects any missing/archived
  selected batch, then accepts the code if it matches the `secret_pass` of **any**
  selected batch (D23) and enrolls the student in **all** of them, so `batchIds`
  (≥1) is required (legacy single `batchId` still accepted). `REGISTRATION_SECRET_PASS`
  is retained only as an **optional global master override** (accepts any batch);
  it is not required and, if unset, only the per-batch code works.
- **Batch switcher:** `GET /api/student/batches` lists the student's enrolled
  batches; `BatchProvider` holds the active selection (persisted to localStorage,
  `null` = all). The header `<select>` shows only when a student has >1 batch and
  filters the `/student` dashboard by the chosen batch.
- Guards in `utils/auth.ts`. Public routes (`/`, `/login`, `/signup`,
  `/leaderboard`) need no session.

**Acceptance:**
- [x] Unauthed → admin route redirects to `/login`.
- [x] Authed user visiting `/`, `/login`, or `/signup` is redirected to their home
      page (teacher → `/admin`, student → `/student`) — no role chooser reshown.
- [x] Student cannot reach admin routes/APIs (middleware + `requireTeacher`).
- [x] Logout clears session.
- [x] Public leaderboard loads with no session *(F8 done)*.
- [x] Student registers with the **batch's** enrollment code (wrong code → 400,
      never partially creates the account); can then log in.
- [x] Student can select **multiple batches** at signup and enroll in all of them
      with **one** matching enrollment code (D23).
- [x] A student in >1 batch sees a **header batch switcher** that filters their
      test dashboard; a student in one batch sees no switcher.

**Code:** `middleware.ts`, `utils/auth.ts`, `app/api/auth/*`,
`app/api/student/batches`, `components/providers/BatchProvider.tsx`,
`components/layout/AppShell.tsx`, `app/login`
(chooser + `student/` + `teacher/` subroutes), `app/signup`,
`app/(protected)/student/page.tsx`.
Rationale in `DECISIONS.md D18`, `D23`.

**Notes:** the earlier "global `REGISTRATION_SECRET_PASS`" design in F1/ARCHITECTURE
contradicted the per-batch `secret_pass` in DATA-MODEL (the source of truth) and the
signup UI's "Provided by your teacher" copy — students given a batch code got
"Invalid secret password" and could never sign in. Reconciled here toward the
per-batch code (D18).

Logout hardened so one device can switch accounts (teacher ↔ student) — D19: the
route now signs out with `scope:'local'`, swallows revoke errors, and explicitly
expires the `sb-*-auth-token` cookies (guaranteed signed-out browser, always 200);
the Sign-out control `router.replace('/login')` + `refresh` instead of a soft push.
Previously a `signOut()` 500 left cookies intact and `middleware.ts` bounced /login
back to the old dashboard, so the switch was impossible.

---

## F2 — Batch management  ✅

**Goal:** Group students into batches; tests belong to a batch.

**UI:** `/admin/batches` (list, *Tailwind* — with Students/Tests count columns and a
detail link), `/admin/batches/new` (create, *Tailwind*), `/admin/batches/[id]`
(detail hub, *antd*: batch info + enrolled students with add/remove + the batch's
tests), `/admin/batches/[id]/edit` (*antd* form → `PUT`).

**Rules:**
- Teacher-only API. Batch soft-delete = archive (`status='archived'`), never
  hard-delete. Un-enrolling a student hard-deletes the `student_batches` junction row
  (the link carries no history — results live in `quiz_attempts`).
- Students m2m with batches (`student_batches`). Enroll/remove writes go through the
  **service role** (no browser write policy on that table, D11); both guard
  `requireTeacher` **and** batch ownership.
- Public signup list via `/api/public/batches` exposes only `id,name,start_time,end_time`.
- A batch carries a **class timing** (`start_time`/`end_time`, time-of-day) instead of a
  free-text course. Both are required on create/edit; shown as a formatted range in the UI
  (helper `utils/batch.ts#formatBatchTiming`). The legacy `course` column is retained
  nullable but unused (D20).

**Acceptance:**
- [x] Create / list / archive a batch (teacher-only).
- [x] **Edit** batch (`/admin/batches/[id]/edit` → `PUT /api/batches/[id]`).
- [x] Batch **detail**: enrolled students + batch's tests + add/remove student.
- [x] List shows accurate student & test **counts**.
- [x] Batch has **start/end timing** (replaces course) surfaced everywhere a batch is shown.

**Code:** `app/(protected)/admin/batches/**` (list + new + `[id]` detail + `[id]/edit`),
`app/api/batches/**` (`route.ts` counts, `[id]/route.ts` detail+PUT+archive,
`[id]/students/route.ts` enroll/remove), `app/api/public/batches`. Reuses
`contactsById` (`utils/students.ts`) and `createAdminClient` (`utils/supabase/admin.ts`).
Rationale in `DECISIONS.md D14`.

---

## F3 — AI test-creation wizard  ✅

**Goal:** Turn a photo of notes/book page into approved MCQs + a scheduled test.

**UI:** `/admin/quizzes/new` — antd `Steps`:
1. **Setup** — title, batch, `scheduled_at` (date+time), duration,
   total required questions, optional marks scheme.
2. **Generate** — drag-drop image upload, count-this-round, extra prompt → generate.
   Also **Add question manually** (opens the question editor with a blank MCQ) so a
   test can be built with no image at all.
3. **Review** — candidate `Card`s with **Approve / Reject / Edit**; running
   `Approved X/Y` progress; "Generate more" appends candidates, keeps approved;
   **Add question manually** here too (goes straight to the approved list).
4. **Publish** — summary → **Publish** or **Save as draft**.
`/admin/quizzes` is **batch-first** (D29): it first shows a premium grid of **batch
cards** (name, timing, live **test count**); tapping a batch drills into that batch's
tests as cards (title, status, schedule, questions) with a breadcrumb/back to the
batch grid. A test card opens **`/admin/quizzes/[id]`** — the test **detail hub**
(results / late-missed report) which is the **only** place a test is **edited or
deleted** (the lists carry no destructive/edit actions). `/admin/quizzes/[id]/edit`
(antd) edits an existing test: settings (title, batch, schedule, duration, marks
scheme, passing marks, **status** = draft/published/closed) plus its questions (same
MCQ editor as the wizard).

**Rules:**
- Only **approved** questions are persisted.
- **Manually added questions are auto-approved** (the teacher authored them, so they
  skip the review queue and land directly in the approved list); they can still be
  removed there. Same `{text, options[4], correctOptionKey, explanation?, difficulty?}`
  shape → same `POST /api/tests` contract; no schema/API change. The editor validates
  non-empty question text + all four options before it can be saved.
- Publish gated on `approved ≥ required`, with explicit confirm to publish fewer.
- Correct answers shown to the teacher here only; never sent to students (F6).
- `POST /api/tests` verifies the batch belongs to the teacher; rolls back the quiz
  if question insert fails (no test left question-less).
- **Edit** (`PUT /api/tests/[id]`): teacher-only, ownership re-checked (404 on
  mismatch); a changed batch must also belong to the teacher. Test **settings** are
  always editable. The **question set** may be replaced **only while the test has no
  attempts** — once any student has attempted, questions are read-only (editing them
  would corrupt already-computed scores); the API returns 409 and the UI locks the
  editor with a notice. `status` edits keep `is_published` mirrored.
- **Delete** (`DELETE /api/tests/[id]`): teacher-only, ownership-checked. A test with
  **no attempts** is hard-deleted (questions cascade). A test that already has
  attempts is **soft-deleted** (`archived_at` set) so results/leaderboard history is
  preserved; archived tests disappear from the teacher list and from students (RLS).
- Reading a test for the edit form pulls `correct_answer`/`explanation` through the
  **service-role** client (those columns are SELECT-revoked from the browser JWT, F10).

**Acceptance:**
- [x] Upload image + count + extra prompt → generate.
- [x] Approve/reject (and edit) each question individually.
- [x] Re-generate repeatedly; approved accumulate across rounds.
- [x] **Add a question + its 4 options manually** (correct one selected); it is
      auto-approved into the approved list. A test can be built entirely by hand.
- [x] Publish only when approved meets required (or admin confirms fewer).
- [x] Published test tied to batch + schedule, status `published`.
- [x] Correct answers not exposed to students (stored as key, filtered in F6).
- [x] **Edit an existing test** — settings always; questions while no attempts
      (locked read-only once attempted). Change status (draft/published/closed).
- [x] **Delete a test** — hard-delete when unattempted; soft-archive (history kept)
      when it has attempts. Archived tests hidden from students and the teacher list.

**Code:** `app/(protected)/admin/quizzes/new/page.tsx`,
`app/(protected)/admin/quizzes/page.tsx`,
`app/(protected)/admin/quizzes/[id]/edit/page.tsx`,
`app/(protected)/admin/quizzes/[id]/page.tsx` (Edit/Delete actions),
`app/api/tests/route.ts`, `app/api/tests/[id]/route.ts` (GET/PUT/DELETE),
`supabase/migrations/20260917140000_quiz_archive.sql`,
`components/providers/AntdProvider.tsx`, `utils/constants.ts`. Rationale in
`DECISIONS.md D22`.

---

## F4 — AI question generation endpoint  ✅

**Goal:** image(s) + count + extra prompt → validated structured MCQs.

**Rules:** teacher-only; `multipart/form-data`; model `gemini-2.0-flash`
(`GEMINI_MODEL` override); strict-JSON prompt; defensive parse (strip fences,
require 4 options + valid key), drop malformed, 502 on unreadable/empty for retry;
API key server-side only.

**Acceptance:**
- [x] Endpoint accepts image(s)+count+extraPrompt, returns validated questions.
- [x] Malformed AI output handled without crashing.
- [x] API key never exposed to client.

**Code:** `app/api/generate/route.ts`. Contract detail in `ARCHITECTURE.md §5`.

**Optional next:** `GenerationLog` table for auditing (image ref, prompt, counts).

---

## F5 — View all students  ✅

**Goal:** One searchable place to see every student + status.

**UI (antd):** `/admin/students` — `Table` (name, email/phone, batches, #tests
taken, last activity) with text search (name/email/phone) + batch filter; row click
→ `/admin/students/[id]` detail (profile, enrolled batches, roll-up stats, and a
full test-history table with **on-time / late / missed** outcome + score).

**Rules:** teacher-only; email/phone come from `auth.users` via the **service role**
(`utils/students.ts`), never exposed to a student session. History outcome is
**derived server-side** (`deriveOutcome`, `utils/test.ts`) so missed/late flags are
authoritative, and it covers non-attempted tests so `missed` surfaces.

**Acceptance:**
- [x] Searchable/filterable student list.
- [x] Student detail with test history + late/missed flags.

**Code:** `app/(protected)/admin/students/page.tsx` +
`app/(protected)/admin/students/[id]/page.tsx`, `GET /api/students`,
`GET /api/students/[id]`, `utils/students.ts` (contact lookup). Header links
`/admin/students`. Rationale in `DECISIONS.md D13`.

---

## F6 — Student: take a test (once, anytime after schedule)  ✅

**Goal:** A student attempts a scheduled test exactly once, any time from the
scheduled moment until the teacher closes it.

**UI (planned, antd):** `/student` home = list of their batch's tests with status
(Upcoming w/ countdown, Available now, Completed, Missed). Take-test screen: one
question view, option selectors, countdown timer, navigator, Submit.

**Rules (enforce server-side — see `DATA-MODEL.md` timing model):**
- Window: startable once `now ≥ scheduled_at`, for as long as the quiz status is
  `published`. **No time-based hard lock** — a student who misses the scheduled
  time can still take it later. Starting is blocked only before `scheduled_at`
  (`upcoming`) or once the teacher sets status `closed` (`closed`).
- **One attempt** (unique constraint + server re-check); reload never grants a second.
- Start/submit after `due` (`scheduled_at + duration`) → `is_late=true`, real
  `started_at` recorded. Each student gets their **full `duration_minutes`** from
  their own start, however late.
- No attempt while status `closed` → `missed`.
- Timer auto-submits at zero; **scoring computed server-side**.
- Correct answers **never** sent to the client during an attempt.

**Acceptance:**
- [x] Can't open before `scheduled_at`.
- [x] Only one attempt; second blocked server-side.
- [x] Late starts allowed anytime while published, flagged `is_late` with real start time.
- [x] Full duration honoured from the real start regardless of how late.
- [x] No attempt on a teacher-closed test → `missed`.
- [x] Timer auto-submits; server scores.

**Code:** `app/(protected)/student/page.tsx`,
`app/(protected)/student/tests/[id]/page.tsx`, `GET /api/student/tests`,
`GET`/`PATCH /api/student/tests/[id]`, `POST /api/student/tests/[id]/start`,
`POST /api/student/tests/[id]/submit`, `utils/test.ts` + `utils/studentTests.ts`
(shared timing/scoring). Uses `requireStudent`. Rationale in `DECISIONS.md D10`.
*(The endpoints landed under `/api/student/tests/*` rather than the earlier
`/api/me/tests` / `/api/tests/[id]/*` sketch — reporting reuses these attempts.)*

---

## F7 — Late / missed reporting (admin)  ✅

**Goal:** Admin always knows who was on-time, late, or missed.

**UI:** `/admin/quizzes/[id]` test detail — roll-up stat cards (enrolled / on-time /
late / missed / in-progress / avg score) + a results `Table` (student, status tag,
started_at, submitted_at, score + %, pass/fail) with per-status filter and column
sorting. Reached from a **View results** action on each row of `/admin/quizzes`.
The same flags will surface on the student detail (F5, when built).

**Rules:**
- Teacher-only; the test must belong to the caller (else 404, no leak).
- Reporting rows cover **every enrolled student** in the test's batch, so
  non-attempters appear as `missed` (window closed) or `pending` (still open).
- Outcome is **derived server-side** from the attempt record + the window phase
  (`utils/test.ts`): `on_time` / `late` (from `is_late`) / `in_progress` /
  `expired` (started, test closed, never submitted) / `missed` / `pending`.
  Since tests no longer time-lock (F6), `missed`/`expired` mean the **teacher
  closed** the test with no / an unfinished attempt; a non-attempter on a still-open
  test is `pending` (they can still take it), not `missed`.
- Read-only — no answers or `correct_answer` returned; teacher's user-scoped
  client reads attempts via its RLS SELECT policy (no service role needed).

**Acceptance:**
- [x] Per test, see who was on-time / late / missed with scores.
- [x] Non-attempters shown (missed vs. pending) — full enrolled cohort, not just
      those who started.
- [x] Roll-up counts + average score across the cohort.

**Code:** `GET /api/tests/[id]/results`,
`app/(protected)/admin/quizzes/[id]/page.tsx`, **View results** link in
`app/(protected)/admin/quizzes/page.tsx`. Rationale in `DECISIONS.md D12`.

---

## F8 — Public leaderboard  ✅

**Goal:** Public, no-login ranking of students.

**UI:** `/leaderboard` (*antd*, public) — ranked `Table` (rank, display name, points,
tests taken, accuracy) with a batch filter (`Select`) and top-3 medal highlight.
Responsive; linked from the landing page.

**Rules & metric (documented default):** **total points across completed
(`submitted`) attempts**, tie-broken by overall accuracy
(`Σ correct_count / Σ questions in taken tests`), then earliest submission. Read via
the **service role** (public, no session) so RLS on `quiz_attempts`/`profiles`
doesn't block the ranking. Expose only public-safe fields (display name + scores) —
**never** email/phone/answers. Batch filter restricts to that batch's tests.

**Acceptance:**
- [x] Loads with no login.
- [x] Ranking correct per metric; updates as results come in (computed live per request).
- [x] No private data exposed (only `full_name` + aggregate scores leave the server).

**Code:** `app/leaderboard/page.tsx`, `GET /api/public/leaderboard` (service role,
optional `?batch=` filter). Reuses `createAdminClient` (`utils/supabase/admin.ts`)
and `GET /api/public/batches` for the filter. Rationale in `DECISIONS.md D15`.

---

## F9 — Admin dashboard  ✅

**Goal:** Replace the `/admin` stub (and the mock `/teacher` page) with real
overview: batch/student/test counts + recent items, wired to live APIs (antd).

**UI (antd):** `/admin` — three gradient stat cards (batches, students, published
tests / total) + two "recent" panels (latest batches → detail, latest tests →
results). The recent panels render **premium custom rows** (gradient icon tile,
title + meta line, hover lift + chevron; tests use a tinted status pill toned by
status, batches show student/test counts) instead of the default antd `List`.
Quick actions to create a batch/test. All data from live APIs; no mock.

**Rules:** teacher-only (already gated by `middleware.ts` + the APIs' `requireTeacher`).
Reuses existing endpoints — no new API. The mock `/teacher` page is **retired**
(now redirects to `/admin`).

**Acceptance:** [x] `/admin` shows live counts + recent batches/tests, no mock data.

**Code:** `app/(protected)/admin/page.tsx` (live antd dashboard),
`app/(protected)/teacher/page.tsx` (redirect → `/admin`). Data from `GET /api/batches`
(counts), `GET /api/students`, `GET /api/tests`. Rationale in `DECISIONS.md D16`.

---

## F10 — Row-Level Security & data confidentiality  ✅

**Goal:** Back the API-layer access control with Supabase RLS so a raw browser
query can't bypass it — above all, so a student's session can't read
`questions.correct_answer` (the take-test API strips it, but the DB didn't).

**Rules:**
- RLS enabled on all six tables; policies mirror the API model (teachers manage;
  students read own attempts + published tests/questions/batches they're enrolled
  in). Helpers `is_teacher()` / `is_enrolled()` (SECURITY DEFINER).
- `questions.correct_answer` + `explanation` column-REVOKEd from `anon`/
  `authenticated`; readable only via the service-role client.
- `quiz_attempts` has **no** browser write policy — all attempt writes go through
  the service role, so scores can't be forged client-side.
- Migrations additive & idempotent; no column renamed/dropped.

**Acceptance:**
- [x] RLS enabled on profiles, batches, student_batches, quizzes, questions,
      quiz_attempts.
- [x] A student session cannot SELECT `correct_answer`/`explanation` (column-revoked).
- [x] A student session cannot INSERT/UPDATE `quiz_attempts` (no policy) — server
      writes via service role.
- [x] Take-test, dashboard, wizard, and batch CRUD still work (typecheck / lint /
      build pass; user-scoped reads covered by SELECT policies).

**Code:** `supabase/migrations/20260915140000_enable_rls.sql`,
`utils/supabase/admin.ts`, `utils/studentTests.ts`,
`app/api/student/tests/[id]/**`. Rationale in `DECISIONS.md D11`.

**Verify against a live DB (needs your own keys):** signed in as a student, hit
`/rest/v1/questions?select=correct_answer` → permission error; `POST
/rest/v1/quiz_attempts` → blocked; normal take/submit via the app still scores.

---

## F11 — Installable Android app (PWA)  ✅

**Goal:** Let students/teachers "download" and run the web app as an Android app
without shipping a native binary. The app is a **Progressive Web App**: Chrome on
Android offers **Install app / Add to Home Screen**, and it then launches
full-screen (standalone) from the home screen like a native app.

**UI:** A **Get / Install Android app** button on the home page (`/`, the role
picker). When the browser reports the app is installable it triggers the native
install prompt directly; otherwise it expands short step-by-step instructions
(with a separate iOS Safari "Add to Home Screen" hint). Once installed (running in
standalone display mode) the button becomes an "App installed" confirmation.

**Rules:**
- Manifest served from `app/manifest.ts` (`/manifest.webmanifest`): name, icons
  (192 + 512, plus a 512 `maskable`), `display: standalone`, `start_url: /`,
  `theme_color #4f46e5`, `background_color #09090b`.
- Service worker `public/sw.js` provides the fetch handler Chrome requires for
  installability + a small app-shell cache. It **never** caches `/api/*`, `/auth`,
  or cross-origin traffic, so Supabase data and sessions are always live — this
  keeps F10 (answer secrecy / RLS) intact; nothing security-critical is cached.
- **Auto-update (no reinstall):** the SW is registered with a per-deploy version
  query — `/sw.js?v=<NEXT_PUBLIC_BUILD_ID>` — and names its cache `ncc-shell-<v>`.
  Each deploy is therefore a *new* worker the browser installs; its `activate`
  step deletes stale caches, and `skipWaiting()` + `clients.claim()` make it take
  control immediately. `PwaRegister` listens for `controllerchange` and silently
  reloads once when the new worker takes over (armed only when a worker was
  already controlling, so the first-ever install never triggers a needless
  reload), and re-checks for updates on tab focus + hourly. `next.config.ts`
  computes `buildId`, inlines it as `NEXT_PUBLIC_BUILD_ID` (via `env`), and serves
  `/sw.js` with `Cache-Control: no-cache` so the worker is never held stale for
  the browser's 24h cap. Static assets use stale-while-revalidate. Result: users
  get updates on next launch **without uninstalling/reinstalling** the PWA.
- No native/APK toolchain: install is via the browser's PWA flow. A native
  wrapper (TWA via Bubblewrap, or Capacitor) is a future option and would reuse
  this same manifest + hosted HTTPS origin.

**App-shell UI (Android-native navigation):** so the installed PWA reads as a
native Android app, the whole app runs inside an app shell rendered once in the
root layout (persists across navigations, no flash):
- **Top app bar** (`AppBar`) — 56dp Material bar with a **back arrow** on
  sub-screens (history-aware, falls back to the section home), a contextual
  **title** derived from the route, and an **overflow menu** (⋮) holding the
  theme toggle + Sign out. Honours `env(safe-area-inset-top)` for the status bar.
- **Bottom navigation** (`BottomNav`) — role-aware top-level tabs (admin: Home /
  Batches / Tests / Students; student: Tests / Ranks) with icon + label and an
  active pill tint. Mobile-only (`md:hidden`); desktop keeps inline tabs in the
  app bar. Honours `env(safe-area-inset-bottom)`; hidden during a test attempt
  (immersive) to avoid mis-taps.
- **Feel:** tap-highlight removed, press-down (`.tap` active scale), page
  enter transition (`route-enter`), disabled page rubber-band — all reduced-motion
  aware. The old web-style hamburger `TopNav` (`components/layout/Header.tsx`) was
  removed in favour of this shell.
- Chrome self-hides on `/`, `/login`, `/signup`, `/home` (no `section`).

**Acceptance:**
- [x] `/manifest.webmanifest` returns a valid manifest with 192 + 512 icons.
- [x] Service worker registers on load; app is flagged installable in Chrome.
- [x] Home page shows an install control that fires the native prompt when
      available and instructions otherwise; standalone shows "App installed".
- [x] No API/auth responses are cached by the service worker.
- [x] A redeploy reaches installed PWAs on next launch (new SW installs, old cache
      cleared, page silently reloads) with **no uninstall/reinstall** required.
- [x] Bottom nav + top app bar render on admin/student/leaderboard; back arrow on
      sub-screens; nav hidden on `/`, auth pages, and during a test attempt.
- [x] `tsc --noEmit`, lint, and `next build` pass.

**Code:** `app/manifest.ts`, `public/sw.js`, `public/icon-192.png`,
`public/icon-512.png`, `components/pwa/InstallApp.tsx` (`PwaRegister` +
`InstallAppButton`), `components/layout/appNav.ts` (nav config/titles),
`components/layout/AppShell.tsx` (`AppBar` / `BottomNav` / `RouteTransition`),
app-shell CSS in `app/globals.css`; wired in `app/layout.tsx`,
`app/(protected)/layout.tsx`, and `app/(protected)/page.tsx`. Auto-update wiring:
`next.config.ts` (`buildId` → `NEXT_PUBLIC_BUILD_ID` + `/sw.js` no-cache header).

**Verify:** `curl` the dev server for `/manifest.webmanifest` and `/sw.js` (200);
in Chrome DevTools → Application → Manifest shows "installable", and mobile Chrome
shows the install prompt. `npx next build` succeeds.

**Notes:**
- **Dark-mode-on-reload fix (antd):** on a hard reload in dark mode, Ant Design
  admin surfaces (cards/tables/panels) rendered **white** on the dark page until a
  client navigation "fixed" them. Cause: `next-themes` cannot know the resolved
  theme during SSR / the first client render (`resolvedTheme` is `undefined`), so
  antd's SSR styles are always extracted in the **light** algorithm; the page then
  paints light-antd even though `.dark` is already on `<html>` pre-paint, and the
  antd cssinjs styles are only regenerated dark once the subtree remounts (which a
  navigation did). Fix in `components/providers/AntdProvider.tsx`: detect hydration
  with `useSyncExternalStore` (server/first-render `false` → then `true`), keep the
  light algorithm until mounted (so hydration matches the SSR markup), and **key
  the `ConfigProvider` by the mounted flag** so the antd tree remounts exactly once
  after hydration with the resolved theme — deterministically reproducing the
  navigation "fix". The key is stable afterwards, so later theme toggles update in
  place and don't drop React state.

---

## F12 — Student home page (banner + sections)  ✅

**Goal:** After a student signs in, land them on a friendly **home** screen (not
straight into the raw test list). The home is a hub: a banner slider up top, then
a row of section cards that route into features (Tests today; Homework and Study
Material later).

**UI (antd):** `/student` is now the **Home** page.
- **Banner slider** — an antd `<Carousel autoplay>` at the top with **6 banner
  images**. Images are **real Neeraj Competitive Classes photos** bundled under
  `public/home/*` (felicitations, toppers, classroom, campus). A short greeting
  ("Welcome back") sits above the slider. The slide list is a single `BANNERS`
  array of local `/home/*.jpg` paths so swapping a creative is a one-line edit;
  local (not remote) so the PWA can serve them offline.
- **Section cards** — a responsive grid of cards:
  - **Tests** — active, routes to `/student/tests` (the test list, moved here).
  - **Homework** — placeholder, marked *Coming soon* and disabled (feature later).
  - **Study Material** — **now active** (F13): routes to `/student/study-material`.
- The former `/student` test list moves verbatim to **`/student/tests`**
  (`/student/tests/[id]` take-page unchanged). Login still redirects to `/student`.

**Rules:**
- Home is presentational only — **no new API, no schema, no server logic.** All
  security-critical behaviour stays in F6's endpoints.
- Banners must be trivially replaceable (single `BANNERS` array). "Coming soon"
  cards are inert (no dead navigation).

**Acceptance:**
- [x] Signing in as a student lands on `/student` showing a 6-image banner slider
      of real Neeraj Competitive Classes photos (bundled under `public/home/`).
- [x] Banner auto-advances and is swipeable/navigable (antd Carousel).
- [x] Tests card opens the existing test list (now at `/student/tests`); its
      batch-switcher filtering still works.
- [x] Homework card renders as disabled "Coming soon". *(Study Material is now
      active — F13; only Homework remains a placeholder.)*
- [x] Bottom nav / app-bar gains a **Home** tab; **Tests** points at `/student/tests`.
- [x] `tsc --noEmit`, lint (changed files), and `next build` pass.

**Code:** `app/(protected)/student/page.tsx` (home), `app/(protected)/student/tests/page.tsx`
(moved test list), `components/layout/appNav.ts` (Home tab + titles).

---

## F13 — Study Material (subject folders → notes: PDF/image)  ✅

**Goal:** A teacher organizes study material by **subject within a batch**, then
files **notes** (title + description with **one or more** PDFs/images) under a
subject. Every student in the batch sees the batch's subjects as **folders** and
opens a folder to read/download all of that subject's notes. `kind` stays free text
(`notes`) so future material kinds slot in without a migration.

**Model (see `DATA-MODEL.md`):** a `subjects` row (name) hangs off a `batch`; a
`study_materials` row (the note: title/description) hangs off a `subject`
(`subject_id`) and keeps its denormalized `batch_id` (= the subject's batch) so the
existing enrollment-based RLS/authorization is unchanged. A note owns **many files**
in the child table `study_material_files` (each a PDF or common image type, D28); the
parent's legacy inline file columns are kept but nullable.

**UI (antd):**
- **Admin `/admin/study-material`** — **batch-first drill** (D29): first a premium
  grid of **batch cards** (name, timing, live **subject count**). Tapping a batch
  drills into that batch's **subjects** as folder cards (name + note count) with an
  **Add subject** action; tapping a subject drills into that **subject's notes** — the
  detail level where every action lives: **Add notes** (modal: Title, optional
  Description, **PDF or image** via antd `Upload` held client-side until submit),
  per-note **View / Download / Delete**, and **Delete subject** (`Popconfirm`, cascades
  its notes + files). Breadcrumb/back climbs subjects → batch grid. The batch and
  subject grids carry no destructive actions.
- **Student `/student/study-material`** — a **folder grid of subjects** for the
  student's enrolled batches (subject name, batch tag, note count). Respects the
  header batch switcher (filters to the active batch when one is selected). Tapping
  a folder opens **`/student/study-material/[subjectId]`**, which lists that
  subject's notes each with description and **View** (inline) + **Download**
  buttons. Reached from the **Study Material** card on the student home (F12) and a
  bottom-nav / app-bar **Study** tab.

**Rules (server-enforced):**
- **Teacher-only subject writes.** `POST /api/subjects` (`requireTeacher`) verifies
  the target batch belongs to the teacher, then inserts a subject. `GET
  /api/subjects?batch=` lists the teacher's subjects (with note counts).
  `DELETE /api/subjects/[id]` re-checks ownership (404 on mismatch) and
  **hard-deletes** the subject; its `study_materials` cascade (FK) and their storage
  objects are removed best-effort first (no orphaned bytes).
- **Teacher-only note writes.** `POST /api/study-materials` (`requireTeacher`,
  multipart) takes a **`subjectId`** and **one or more** `file` parts, validates each
  is a PDF or image (`application/pdf` / `image/*`, ≤ **100 MB** each, ≤ 20 files),
  verifies the subject → batch belongs to the teacher, inserts the note parent, then
  uploads each file's bytes to the **active private storage provider** via the shared
  `utils/storage.ts` layer (Supabase Storage by default; **Cloudinary** once
  `STORAGE_PROVIDER=cloudinary`, e.g. after the Supabase free tier fills — D27) and
  records a `study_material_files` child row (its own `storage_provider` +
  provider-relative `file_path`, `order`). If any upload/insert fails, the uploaded
  objects **and** the parent note are rolled back (no orphan). `DELETE
  /api/study-materials/[id]` hard-deletes (ownership-checked): it removes every file
  object **from whichever provider holds it** (per row) then the note (child rows
  cascade).
- **Students read only their batches.** `GET /api/student/subjects` (`requireStudent`)
  lists non-archived subjects (with note counts) in the student's enrolled batches
  (opt. `?batch=`). `GET /api/student/study-materials?subject=` lists a subject's
  notes after re-checking the student is enrolled in that subject's batch. RLS on
  `subjects` and `study_materials` mirrors this (teacher CRUD; student SELECT
  enrolled + non-archived).
- **File access is authorized every time.** The shared
  `GET /api/study-materials/[id]/download?file=<fileId>` (`requireUser`) authorizes
  the caller (owning teacher, or a student enrolled in the material's `batch_id`; else
  403/404), resolves the requested file (verified to belong to the note; defaults to
  the note's first file) and only then mints a short-lived / signed URL **for the
  file's own provider** (`utils/storage.ts#signedUrl`) — `?mode=download` (attachment,
  original filename) or `?mode=view` (inline). Enrollment is re-checked each time. (Supabase → a ~60 s
  signed URL; Cloudinary → an expiring `private_download_url` for download and a
  signed `authenticated` delivery URL for inline view — D27.)
- **Additive & idempotent:** new `subjects` + `study_material_files` tables; a
  **nullable** `subject_id` on `study_materials` + relaxed NOT NULL on its legacy file
  columns; no existing column renamed/dropped, reuses the D24 bucket. Existing
  single-file notes are backfilled into `study_material_files` (D28).

**Acceptance:**
- [x] Teacher adds a subject to a batch; it appears as a folder in the admin list.
- [x] Teacher files a note (title + description with **one or more** PDFs/images)
      under a subject; every file appears under that note in the subject's folder.
- [x] Non-PDF/-image or oversized (> 100 MB) upload is rejected server-side; a
      cross-teacher batch/subject is refused.
- [x] A student enrolled in the batch sees the subject folders and, opening one,
      can **view** and **download** each of a note's files; filenames are preserved.
- [x] A student **not** enrolled in the batch cannot list the subject or its notes,
      nor download them (RLS + subject/enrollment re-check).
- [x] Deleting a note removes its row + file; deleting a subject cascades its notes
      + files.
- [x] Student home **Study Material** card + a **Study** nav tab route to the folder
      view; the header batch switcher filters it.
- [x] `tsc --noEmit`, lint (changed files), and `next build` pass.

**Code:** `supabase/migrations/20260917160000_study_materials.sql` (bucket + notes
table, D24) + `supabase/migrations/20260918120000_study_material_subjects.sql`
(subjects table + RLS + `study_materials.subject_id`) +
`supabase/migrations/20260921160000_multi_file_uploads.sql` (child file tables +
RLS + backfill, D28), `utils/files.ts` (child-file loaders + per-file download
resolver),
`app/api/subjects/route.ts` (GET/POST), `app/api/subjects/[id]/route.ts` (DELETE),
`app/api/student/subjects/route.ts` (GET),
`app/api/study-materials/route.ts` (GET/POST — subject-scoped),
`app/api/study-materials/[id]/route.ts` (DELETE),
`app/api/study-materials/[id]/download/route.ts` (signed URL),
`app/api/student/study-materials/route.ts` (GET — `?subject=`),
`app/(protected)/admin/study-material/page.tsx`,
`app/(protected)/student/study-material/page.tsx` (folder grid),
`app/(protected)/student/study-material/[subjectId]/page.tsx` (notes in a subject),
`utils/studyMaterial.ts` (shared types + PDF/image constants),
`utils/storage.ts` (provider-agnostic upload/signed-URL/delete — Supabase | Cloudinary, D27),
`supabase/migrations/20260918160000_storage_provider.sql` (`storage_provider` column),
`components/layout/appNav.ts` (Study tab + titles),
`app/(protected)/student/page.tsx` (F12 card → active). Rationale in
`DECISIONS.md D24`, `D25`, `D27`.

---

## F14 — Homework (batch-wise: MCQ attempt + PDF/image mark-done)  ✅

**Goal:** A teacher assigns **homework** to a batch. Two kinds, chosen on one
create screen via **two tabs**:
- **MCQ** — a question set the teacher builds **manually and/or with AI** (same
  photo → questions endpoint as Tests, `/api/generate`). Students **attempt &
  submit** it once; graded server-side (no countdown timer — homework isn't timed).
- **PDF / Image** — the teacher uploads **one or more** files. Students read them
  and simply **mark the homework done** (no upload back).

**Model (see `DATA-MODEL.md`):** a `homework` row (`type` = `mcq` | `file`) hangs
off a `batch`. MCQ questions live in `homework_questions` (mirrors `questions`,
answer columns column-REVOKEd). One `homework_attempts` row per student per
homework (UNIQUE) records either a graded MCQ `submitted` attempt or a `done`
completion. A `file` homework owns **many files** in the child table
`homework_files` (D28); their bytes live in a **private** `homework` store, reached
only via server-minted signed URLs through the shared `utils/storage.ts` layer —
Supabase Storage by default, **Cloudinary** once `STORAGE_PROVIDER=cloudinary` (each
file row stamps its `storage_provider`, so upload/download/delete route per-file; D27).

**UI (antd):**
- **Admin `/admin/homework`** — **batch-first** (D29): first a premium grid of
  **batch cards** (name, timing, live **homework count**); tapping a batch drills into
  that batch's homework as cards (title, type, published/draft, question-count or
  file count) with a breadcrumb/back to the batch grid. A homework card opens the
  **new** homework **detail hub** **`/admin/homework/[id]`** (full info + MCQ
  questions or attached files) — the **only** place a homework is **viewed/downloaded
  or deleted** (the lists carry no destructive actions). **Create homework** launches
  **`/admin/homework/new`** (batch prefilled when created from inside a batch).
  **`/admin/homework/new`** is the create screen:
  shared header (title, batch, optional due date, description, publish/draft) then
  **Tabs**: *MCQ questions* (photo → **Generate** with the AI endpoint, plus **Add
  manually**; each question editable/removable; optional marks scheme + target) and
  *PDF / Image* (**multi-file** `Upload`, held client-side until submit). Submit posts
  to `POST /api/homework` (JSON for MCQ, multipart for file).
- **Student `/student/homework`** — homework for the student's enrolled batches
  (respects the header batch switcher), each tagged **To do** / **Done** (+ score
  for graded MCQ). **`/student/homework/[id]`** = the MCQ attempt form → submit →
  graded review, or the file view/download → **Mark as done**. Reached from the now
  **active** Homework card on the student home (F12) and a **Homework** nav tab.

**Rules (server-enforced):**
- **Teacher-only writes.** `POST /api/homework` (`requireTeacher`) verifies the
  target batch belongs to the teacher. MCQ: inserts the homework + its questions
  (rolls back the homework if the question insert fails). File: accepts **one or more**
  `file` parts, validates each is a PDF/image (`application/pdf` / `image/*`, ≤ **100
  MB** each, ≤ 20 files), inserts the homework parent, uploads each to the private
  `homework` store (path `<batch_id>/<uuid>.<ext>`), then inserts a `homework_files`
  child row per file (rolls back all objects **and** the parent on failure). `GET
  /api/homework?batch=` lists the teacher's homework with question counts + attached
  files. `GET /api/homework/[id]` returns the full homework (MCQ answers via the
  **service role**, column-revoked; file rows for `file` homework). `DELETE
  /api/homework/[id]` hard-deletes when unattempted (questions + file rows cascade,
  file objects removed) else **archives** (`archived_at`) so completion/score history
  survives.
- **Answer secrecy (mirrors F10).** `homework_questions.correct_answer`/`explanation`
  are column-REVOKEd from the browser JWT; students read only the question **body**.
  Scoring reads answers via the **service role** and `homework_attempts` has **no**
  browser write policy — every attempt/completion is written server-side, so scores
  can't be forged.
- **Students read only their batches.** `GET /api/student/homework` lists published,
  non-archived homework in enrolled batches (opt. `?batch=`) with the student's own
  attempt. `GET /api/student/homework/[id]` returns the body (no answers) + attempt +
  a graded review once submitted. `POST …/[id]/submit` grades an MCQ attempt (single
  attempt: UNIQUE + a pre-check → 409). `POST …/[id]/complete` marks a file homework
  done (idempotent). `GET /api/homework/[id]/download?file=<fileId>&mode=view|download`
  (shared, `requireUser`) authorizes teacher-owns / student-enrolled, resolves the
  requested file (defaults to the first), then mints a ~60 s signed URL. RLS mirrors
  all of this.
- **Additive & idempotent:** the F14 tables + bucket, plus the D28 `homework_files`
  child table + RLS + backfill of existing single-file homework; no existing column
  renamed/dropped; reuses the RLS helpers + the Study-Material accepted-mime rules.

**Acceptance:**
- [x] Teacher creates **MCQ** homework for a batch — builds questions **manually
      and/or via AI** — and it appears in the admin list; students can attempt it.
- [x] Teacher creates **PDF/Image** homework (file upload) for a batch; non-PDF/-image
      or oversized upload is rejected server-side; a cross-teacher batch is refused.
- [x] A student attempts MCQ homework **once** (second submit blocked server-side),
      graded server-side; correct answers never reach the client before submit.
- [x] A student **views/downloads** PDF/image homework and **marks it done** (no
      upload); a student not enrolled in the batch can't list/open it.
- [x] Deleting unattempted homework removes it (+ file); once attempted it archives
      (history kept) and disappears from students + the teacher list.
- [x] Student home **Homework** card + a **Homework** nav tab route to the list; the
      header batch switcher filters it.
- [x] `tsc --noEmit`, lint (changed files), and `next build` pass.

**Code:** `supabase/migrations/20260918140000_homework.sql` (tables + RLS + bucket +
column revokes) + `supabase/migrations/20260921160000_multi_file_uploads.sql`
(`homework_files` child table + RLS + backfill, D28), `utils/homework.ts` (shared
types/constants), `utils/files.ts` (child-file loaders + per-file download resolver),
`utils/studentHomework.ts` (student gate + scoring + mark-done),
`app/api/homework/route.ts` (GET/POST), `app/api/homework/[id]/route.ts`
(GET/DELETE), `app/api/homework/[id]/download/route.ts` (signed URL),
`app/api/student/homework/route.ts` (GET),
`app/api/student/homework/[id]/route.ts` (GET),
`app/api/student/homework/[id]/submit/route.ts` (POST — MCQ),
`app/api/student/homework/[id]/complete/route.ts` (POST — file mark-done),
`app/(protected)/admin/homework/page.tsx` (batch-first list, D29),
`app/(protected)/admin/homework/[id]/page.tsx` (detail hub — view/download/delete, D29),
`app/(protected)/admin/homework/new/page.tsx` (two-tab create),
`components/admin/BatchPicker.tsx` + `components/admin/useDrillStack.ts` (shared batch-first drill, D29),
`app/(protected)/student/homework/page.tsx` (list),
`app/(protected)/student/homework/[id]/page.tsx` (attempt / file mark-done),
`components/layout/appNav.ts` (Homework tabs + titles),
`app/(protected)/student/page.tsx` (F12 card → active). Reuses `/api/generate`
(F4), `utils/test.ts` scoring, `utils/studyMaterial.ts` mime rules.

---

## F15 — Student push notifications (homework · tests · study material)  🟡

**Goal:** Push a native-style notification to a student's device — even when the
app is closed — the moment new work lands, so they never miss it: **homework
published**, a **study-material note added**, a **test published**, and a reminder
when a **test goes live** (its `scheduled_at` arrives). Built on the existing PWA
(F11): reuses the installed service worker, no native app/APK.

**Delivery — Web Push (VAPID):** the only mechanism that reaches a closed PWA.
- **Server** signs pushes with a VAPID keypair (`VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) via the `web-push` library — server-only,
  keys never leave the server except the **public** key (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  needed by the browser to subscribe).
- **Service worker** (`public/sw.js`) gains `push` (show the notification, carrying a
  deep-link `data.url`) and `notificationclick` (focus an open tab or open the URL)
  handlers. No caching change — F10/F11 answer-secrecy/offline behaviour is untouched.
- **Client** `PushToggle` asks for `Notification` permission, `pushManager.subscribe`s
  with the public key, and POSTs the subscription to the server.

**Model (see `DATA-MODEL.md`):**
- **`push_subscriptions`** — one row per device endpoint (`user_id`, unique
  `endpoint`, `p256dh`, `auth`, `user_agent`). Written server-side (service role)
  after `requireUser`; a dead endpoint (push service returns 404/410) is auto-pruned
  on the next send. RLS: a user may SELECT only their own rows; **no client writes**.
- **`notification_events`** — an idempotency/audit log, **unique `(type, ref_id,
  user_id)`**. Every send "claims" a row first (upsert, ignore-duplicates); only
  newly-claimed users are actually pushed, so a student is never double-notified —
  essential for the periodic test-live cron, and it also makes re-publish a no-op.

**Triggers (server-enforced fan-out):** all fan-out targets **students enrolled in
the batch** and is **best-effort** — wrapped so a push failure can never break the
teacher action that triggered it.

| Event | Fires from | type | Deep-link |
|---|---|---|---|
| Homework **published** | `POST /api/homework` (mcq/file, only when `status=published`) | `homework` | `/student/homework/[id]` |
| Study-material note added | `POST /api/study-materials` | `study_material` | `/student/study-material/[subjectId]` |
| Test **published** | `POST /api/tests` / `PUT /api/tests/[id]` (publish) | `test_published` | `/student/tests/[id]` |
| Test **is live now** (`now ≥ scheduled_at`) | `GET /api/cron/notify` (scheduler) | `test_live` | `/student/tests/[id]` |

**Scheduler (test-live reminder):** a cron hits `GET /api/cron/notify`, guarded by a
`CRON_SECRET` bearer token (401 otherwise). It scans **published, non-archived** tests
whose `scheduled_at` has passed within a short look-back window and fans out a
`test_live` push; `notification_events` dedupe means each student is reminded once no
matter how often the cron runs. Wire it to **Vercel Cron** (or Supabase `pg_cron`) at
a few-minute cadence — see `.env.example` / `DECISIONS.md D30`.

**Opt-in UX:** a **bell toggle** (`PushToggle`) on the student home (`/student`).
Browsers require a user gesture to grant notification permission, so it is strictly
opt-in; the toggle reflects the live permission/subscription state and hides where
push is unsupported or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is unset. **iOS:** web push
works only for an **installed** PWA on iOS 16.4+ (Add to Home Screen) — documented in
the toggle's hint.

**Rules:**
- **Students only** are notified (fan-out is over `student_batches`); the teacher
  authoring the content isn't pushed.
- Security-critical behaviour is unchanged: notifications carry only a title + the
  item name + a deep link — **never** answers or private data. The subscription
  write trusts the authed `user.id`, never a client-supplied one.
- Additive & idempotent migration; no existing column renamed/dropped.

**Acceptance:**
- [ ] Student enables notifications from `/student`; a subscription is stored.
- [ ] Publishing homework / adding a note / publishing a test pushes enrolled
      students a notification that deep-links to the item.
- [ ] The cron pushes a "test is live" reminder once per student when `scheduled_at`
      passes (dedupe prevents repeats across runs).
- [ ] Tapping a notification focuses/opens the app at the deep link.
- [ ] A push failure never breaks creating homework/tests/notes; a stale endpoint is
      pruned.
- [ ] With VAPID unconfigured the app builds and behaves exactly as before (feature
      is a no-op, toggle hidden).
- [ ] `tsc --noEmit`, lint (changed files), and `next build` pass.

**Code:** `supabase/migrations/20260921180000_push_notifications.sql`,
`utils/push.ts` (VAPID config + `notifyBatchStudents`/`notifyUsers` + dedupe + prune),
`app/api/push/subscribe/route.ts` (POST/DELETE), `app/api/cron/notify/route.ts` (GET),
`public/sw.js` (push + notificationclick), `components/pwa/PushToggle.tsx`,
`app/(protected)/student/page.tsx` (mounts the toggle); trigger calls added to
`app/api/homework/route.ts`, `app/api/study-materials/route.ts`,
`app/api/tests/route.ts`, `app/api/tests/[id]/route.ts`. Rationale in
`DECISIONS.md D30`.

---

## Build order (remaining)

Seed data + full verification pass.
(F2/F3/F4/F5/F6/F7/F8/F9/F10/F12/F13/F14 done; F15 in progress.)

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

---

## F1 — Authentication & roles  ✅

**Goal:** Role-aware access; teacher (=admin) vs student, plus public pages.

**UI:** `/login` (role toggle), `/signup` (student self-register: pick a batch +
enter that batch's enrollment code), logout in header. *(Tailwind — existing.)*

**Rules:**
- `middleware.ts` gates `/admin/*` (teacher) and `/student/*` (authed); redirects
  authed users off `/login`/`/signup`.
- Teacher bootstrapped from `TEACHER_EMAIL`/`TEACHER_PASSWORD` (auto-provisioned on
  first login).
- **Student self-registration is gated by the selected batch's per-batch
  `secret_pass`** (the enrollment code the teacher hands out — see
  `DATA-MODEL.md → batches.secret_pass`), **not** a single global secret. The
  register route (service-role) looks up the chosen active batch and compares the
  entered code to *that batch's* `secret_pass`. A student is enrolled in that batch
  on success, so `batchId` is required. `REGISTRATION_SECRET_PASS` is retained only
  as an **optional global master override** (accepts any batch) for admin
  convenience; it is not required and, if unset, only the per-batch code works.
- Guards in `utils/auth.ts`. Public routes (`/`, `/login`, `/signup`,
  `/leaderboard`) need no session.

**Acceptance:**
- [x] Unauthed → admin route redirects to `/login`.
- [x] Student cannot reach admin routes/APIs (middleware + `requireTeacher`).
- [x] Logout clears session.
- [x] Public leaderboard loads with no session *(F8 done)*.
- [x] Student registers with the **batch's** enrollment code (wrong code → 400,
      never partially creates the account); can then log in.

**Code:** `middleware.ts`, `utils/auth.ts`, `app/api/auth/*`, `app/login`, `app/signup`.
Rationale in `DECISIONS.md D18`.

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
- Public signup list via `/api/public/batches` exposes only `id,name,course`.

**Acceptance:**
- [x] Create / list / archive a batch (teacher-only).
- [x] **Edit** batch (`/admin/batches/[id]/edit` → `PUT /api/batches/[id]`).
- [x] Batch **detail**: enrolled students + batch's tests + add/remove student.
- [x] List shows accurate student & test **counts**.

**Code:** `app/(protected)/admin/batches/**` (list + new + `[id]` detail + `[id]/edit`),
`app/api/batches/**` (`route.ts` counts, `[id]/route.ts` detail+PUT+archive,
`[id]/students/route.ts` enroll/remove), `app/api/public/batches`. Reuses
`contactsById` (`utils/students.ts`) and `createAdminClient` (`utils/supabase/admin.ts`).
Rationale in `DECISIONS.md D14`.

---

## F3 — AI test-creation wizard  ✅

**Goal:** Turn a photo of notes/book page into approved MCQs + a scheduled test.

**UI:** `/admin/quizzes/new` — antd `Steps`:
1. **Setup** — title, batch, exam level, `scheduled_at` (date+time), duration,
   total required questions, optional marks scheme.
2. **Generate** — drag-drop image upload, count-this-round, extra prompt → generate.
   Also **Add question manually** (opens the question editor with a blank MCQ) so a
   test can be built with no image at all.
3. **Review** — candidate `Card`s with **Approve / Reject / Edit**; running
   `Approved X/Y` progress; "Generate more" appends candidates, keeps approved;
   **Add question manually** here too (goes straight to the approved list).
4. **Publish** — summary → **Publish** or **Save as draft**.
`/admin/quizzes` lists tests (antd `Table`).

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

**Acceptance:**
- [x] Upload image + count + extra prompt + level → generate.
- [x] Approve/reject (and edit) each question individually.
- [x] Re-generate repeatedly; approved accumulate across rounds.
- [x] **Add a question + its 4 options manually** (correct one selected); it is
      auto-approved into the approved list. A test can be built entirely by hand.
- [x] Publish only when approved meets required (or admin confirms fewer).
- [x] Published test tied to batch + schedule, status `published`.
- [x] Correct answers not exposed to students (stored as key, filtered in F6).

**Code:** `app/(protected)/admin/quizzes/new/page.tsx`,
`app/(protected)/admin/quizzes/page.tsx`, `app/api/tests/route.ts`,
`components/providers/AntdProvider.tsx`, `utils/constants.ts`.

---

## F4 — AI question generation endpoint  ✅

**Goal:** image(s) + level + count + extra prompt → validated structured MCQs.

**Rules:** teacher-only; `multipart/form-data`; model `gemini-2.0-flash`
(`GEMINI_MODEL` override); strict-JSON prompt; defensive parse (strip fences,
require 4 options + valid key), drop malformed, 502 on unreadable/empty for retry;
API key server-side only.

**Acceptance:**
- [x] Endpoint accepts image(s)+level+count+extraPrompt, returns validated questions.
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

## F6 — Student: take a test (once, on schedule)  ✅

**Goal:** A student attempts a scheduled test exactly once, within the window.

**UI (planned, antd):** `/student` home = list of their batch's tests with status
(Upcoming w/ countdown, Available now, Completed, Missed). Take-test screen: one
question view, option selectors, countdown timer, navigator, Submit.

**Rules (enforce server-side — see `DATA-MODEL.md` timing model):**
- Window: startable `open ≤ now ≤ hardClose` (`hardClose = end + LATE_GRACE_MINUTES`).
- **One attempt** (unique constraint + server re-check); reload never grants a second.
- Start after `end`→ `is_late=true`, record real `started_at`.
- No attempt by `hardClose` → `missed`.
- Timer auto-submits at zero; **scoring computed server-side**.
- Correct answers **never** sent to the client during an attempt.

**Acceptance:**
- [x] Can't open before `scheduled_at`.
- [x] Only one attempt; second blocked server-side.
- [x] Late starts allowed within grace, flagged `is_late` with real start time.
- [x] No-attempt-in-window → `missed`.
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
  `expired` (started, window closed, never submitted) / `missed` / `pending`.
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

**UI (antd):** `/admin` — three `Statistic` cards (batches, students, published
tests / total) + two "recent" lists (latest batches → detail, latest tests →
results). Quick actions to create a batch/test. All data from live APIs; no mock.

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
- [x] Bottom nav + top app bar render on admin/student/leaderboard; back arrow on
      sub-screens; nav hidden on `/`, auth pages, and during a test attempt.
- [x] `tsc --noEmit`, lint, and `next build` pass.

**Code:** `app/manifest.ts`, `public/sw.js`, `public/icon-192.png`,
`public/icon-512.png`, `components/pwa/InstallApp.tsx` (`PwaRegister` +
`InstallAppButton`), `components/layout/appNav.ts` (nav config/titles),
`components/layout/AppShell.tsx` (`AppBar` / `BottomNav` / `RouteTransition`),
app-shell CSS in `app/globals.css`; wired in `app/layout.tsx`,
`app/(protected)/layout.tsx`, and `app/(protected)/page.tsx`.

**Verify:** `curl` the dev server for `/manifest.webmanifest` and `/sw.js` (200);
in Chrome DevTools → Application → Manifest shows "installable", and mobile Chrome
shows the install prompt. `npx next build` succeeds.

---

## Build order (remaining)

Seed data + full verification pass.
(F2/F3/F4/F5/F6/F7/F8/F9/F10 done.)

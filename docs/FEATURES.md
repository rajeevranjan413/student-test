# Features

> One entry per feature. Each has **Goal / UI / Rules / Acceptance / Status /
> Code**. This is the doc-first backlog: to change or add a feature, update the
> relevant entry here (and `ARCHITECTURE.md` / `DATA-MODEL.md` if contracts move)
> **before** writing code. Status legend: ✅ done · 🟡 partial · 🔴 pending.

Feature index:

| # | Feature | Status |
|---|---|---|
| F1 | Authentication & roles | 🟡 |
| F2 | Batch management | ✅ |
| F3 | AI test-creation wizard | ✅ |
| F4 | AI question generation (endpoint) | ✅ |
| F5 | View all students | ✅ |
| F6 | Student — take a test | ✅ |
| F7 | Late / missed reporting | ✅ |
| F8 | Public leaderboard | ✅ |
| F9 | Admin dashboard | ✅ |
| F10 | RLS & data confidentiality | ✅ |

---

## F1 — Authentication & roles  🟡

**Goal:** Role-aware access; teacher (=admin) vs student, plus public pages.

**UI:** `/login` (role toggle), `/signup` (student self-register w/ batch + secret
key), logout in header. *(Tailwind — existing.)*

**Rules:**
- `middleware.ts` gates `/admin/*` (teacher) and `/student/*` (authed); redirects
  authed users off `/login`/`/signup`.
- Teacher bootstrapped from `TEACHER_EMAIL`/`TEACHER_PASSWORD`; students need
  `REGISTRATION_SECRET_PASS`. Guards in `utils/auth.ts`.
- Public routes (`/`, `/login`, `/signup`, future `/leaderboard`) need no session.

**Acceptance:**
- [x] Unauthed → admin route redirects to `/login`.
- [x] Student cannot reach admin routes/APIs (middleware + `requireTeacher`).
- [x] Logout clears session.
- [x] Public leaderboard loads with no session *(F8 done)*.

**Code:** `middleware.ts`, `utils/auth.ts`, `app/api/auth/*`, `app/login`, `app/signup`.

**Gaps:** header user menu has no real logout wiring on every page; role is
inferred as `student` fallback — fine, but document if that changes.

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
3. **Review** — candidate `Card`s with **Approve / Reject / Edit**; running
   `Approved X/Y` progress; "Generate more" appends candidates, keeps approved.
4. **Publish** — summary → **Publish** or **Save as draft**.
`/admin/quizzes` lists tests (antd `Table`).

**Rules:**
- Only **approved** questions are persisted.
- Publish gated on `approved ≥ required`, with explicit confirm to publish fewer.
- Correct answers shown to the teacher here only; never sent to students (F6).
- `POST /api/tests` verifies the batch belongs to the teacher; rolls back the quiz
  if question insert fails (no test left question-less).

**Acceptance:**
- [x] Upload image + count + extra prompt + level → generate.
- [x] Approve/reject (and edit) each question individually.
- [x] Re-generate repeatedly; approved accumulate across rounds.
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

## Build order (remaining)

Seed data + full verification pass.
(F2/F3/F4/F5/F6/F7/F8/F9/F10 done.)

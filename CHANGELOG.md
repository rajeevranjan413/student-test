# CHANGELOG

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

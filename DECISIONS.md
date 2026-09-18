# DECISIONS.md

Design decisions made while completing the Coaching Center app. Each entry notes
what was decided and why, so future work stays consistent.

## D1 — `teacher` role == the spec's `admin`
The DB enum is `('student','teacher')` and all admin screens/middleware key off
`teacher`. Rather than renaming the enum (a breaking migration touching auth), we
treat **`teacher` as the admin role** everywhere. New server guards live in
`utils/auth.ts` (`requireTeacher`, `requireUser`).

## D2 — UI: Ant Design for new screens, Tailwind kept for existing ones
Per maintainer decision, **new UI is built with Ant Design (antd)**; the existing
Tailwind v4 pages (`/login`, `/signup`, `/admin/batches`, landing) are left as-is.
antd + `@ant-design/nextjs-registry` were added to `package.json`. The registry
must wrap the app (or the antd-using subtree) for SSR style extraction — to be
wired when the first antd screen lands. Two styling systems coexist by design.

## D3 — Fixed the broken first migration in place
`20260913094724_create_quizzes_tables.sql` was missing `create table quizzes (`,
so it could never apply. Because a non-applying migration has never run anywhere,
it was corrected in place rather than shadowed by a new migration.

## D4 — Schema extensions are additive and idempotent
`20260915120000_extend_scheduling_and_attempts.sql` only ADDs columns/enums/
constraints (guarded with `IF NOT EXISTS` / `DO` blocks). No column is renamed or
dropped, keeping older code paths working. Legacy `is_published` is mirrored into
the new `quizzes.status` enum.

## D5 — Question storage shape
`questions.options` (jsonb) now holds `[{ "key": "A", "text": "..." }]` and
`correct_answer` holds the correct **key** (e.g. `"B"`). This matches the AI
output contract and lets the student UI render options without exposing the answer
separately. Older rows with a bare string[] still parse.

## D6 — AI contract & model
- Model id `gemini-3.8-flash` (invalid) → **`gemini-2.0-flash`**, overridable via
  `GEMINI_MODEL`.
- `POST /api/generate` is **teacher-only**, accepts `images` (multiple) + `count`
  + `extraPrompt` (legacy `image`/`prompt` still accepted), and
  returns validated questions in the spec JSON shape. Malformed candidates are
  dropped; unreadable responses return a 502 the UI can retry.
  - The `examLevel` param and the test "Exam / level" field were later removed
    (the `quizzes.exam_level` column is kept nullable for back-compat but unused).

## D7 — Batch API hardening
- `GET/POST/PUT/DELETE /api/batches*` now require the **teacher** role.
- `DELETE` is a **soft-delete** (`status='archived'`) to preserve results/history.
- The public signup dropdown uses a new **`GET /api/public/batches`** that returns
  only `id, name, course` — never `secret_pass`.

## D8 — Single-attempt & timing enforcement (schema groundwork)
`quiz_attempts` gained `started_at, submitted_at, is_late, status, correct_count,
answers` plus a **UNIQUE(quiz_id, student_id)** constraint. This is the DB-level
guarantee behind "one attempt per student"; the take-test endpoints (future pass)
enforce the window and scoring server-side on top of it.

## D9 — AI test-creation wizard (spec §3.3) — DONE
- antd wired: `AntdProvider` (AntdRegistry + ConfigProvider dark/light synced to
  next-themes + antd `App` context, `component={false}` so Tailwind pages are
  untouched) wraps the app in the root layout.
- `/admin/quizzes/new`: 4-step antd `Steps` wizard — Setup (title/batch/level/
  schedule/duration/required count/marks) → Generate (image upload + count +
  extra prompt → `/api/generate`) → Review (approve/reject/**edit** cards, running
  `Approved X/Y` counter, "generate more" appends while keeping approved) →
  Confirm & Publish (or Save as draft) → `POST /api/tests`.
- Publish is gated on approved ≥ required, with an explicit confirm to publish fewer.
- Edit modal initialises from props via a remount `key` (no prop→state effect),
  keeping it clear of the `react-hooks/set-state-in-effect` rule.
- `/admin/quizzes`: antd `Table` list of tests via `GET /api/tests`.
- Exam levels centralised in `utils/constants.ts` (`EXAM_LEVELS`) — edit to taste.

## D10 — Student take-test flow (spec §3.5) — DONE
- **Timing model (server-authoritative, `utils/test.ts`):**
  `opensAt = scheduled_at`, `dueAt = opensAt + duration_minutes` (on-time
  deadline), `closesAt = dueAt + LATE_GRACE_MINUTES` (hard lock, grace = 15 min,
  `utils/constants.ts`). A student may **start** only while
  `now ∈ [opensAt, closesAt)`. Their **personal deadline** is
  `min(started_at + duration, closesAt)` — starting late eats into your own time
  but never past the hard lock.
- **Window lock:** `start`/`submit` reject `upcoming` (403) and `closed` (403);
  the dashboard/take page show upcoming/missed states accordingly.
- **Single attempt:** enforced by the `UNIQUE(quiz_id, student_id)` constraint
  (D8) plus status guards. `start` is idempotent — an existing `in_progress`
  attempt is **resumed**, a `submitted` one is rejected. A double-start race
  surfaces as `23505` and is caught → resume.
- **Late flag:** `is_late = submitted_at > dueAt`, computed on the server from the
  actual submit time (capped at the personal deadline so a slow network can't buy
  an on-time flag).
- **Server scoring (`scoreAttempt`/`finalizeAttempt`):** the ONLY place correct
  answers are read. `+marks_per_question` per correct, `−negative_marking` per
  *answered* wrong, blanks neutral, total floored at 0. The take payload
  (`loadPublicQuestions`) strips `correct_answer`; it is exposed only in the
  post-submit review.
- **Auto-submit & durability:** answers autosave (debounced `PATCH`) into
  `quiz_attempts.answers`, so the client countdown's `onFinish`, an explicit
  submit, or a lazy server-side finalize on next load (tab closed past the
  deadline) all score the student's real saved choices. `finalizeAttempt` is the
  single shared path for all three.
- **Score column widened** to `NUMERIC` (migration `20260915130000`) so fractional
  negative marking is stored exactly.
- **Access scope:** `requireStudent` + `requireStudentTest` restrict every route
  to published tests in a batch the student is enrolled in (`student_batches`).

## D11 — Row-Level Security + answer confidentiality (RLS follow-up) — DONE
Closes the higher-priority follow-up. Until now access control lived only in the
API layer, and every user-scoped Route Handler uses the **same anon key + user
JWT** as the browser — so a signed-in student could query Supabase directly and
read `questions.correct_answer`, or even write their own `quiz_attempts` (a forged
score). Migration `20260915140000_enable_rls.sql` backs the API with RLS:
- **RLS enabled on all six tables** with policies mirroring the API access model:
  teachers manage their data (`is_teacher()`); students read only their **own**
  attempts and the **published** tests/questions/batches of a batch they are
  **enrolled** in (`is_enrolled(batch_id)`). Two SECURITY DEFINER helpers
  (`is_teacher`, `is_enrolled`) do the profile/enrollment lookups without
  recursing into those tables' own RLS.
- **Answer columns are column-REVOKEd** (`correct_answer`, `explanation`) from
  `anon`/`authenticated`: no browser/user session can select them even with a
  hand-crafted query. This is the "column-masked" option from the old open item.
- **`quiz_attempts` has no browser write policy** — every attempt insert/update
  (start, autosave, finalize) now goes through the **service-role** client
  (`utils/supabase/admin.ts`), which bypasses RLS + column grants. Reads of answers
  for scoring/review use the same client. This also makes client-side score
  tampering impossible, not just answer reads.
- **Trade-off — `secret_pass`:** teacher and student share the one `authenticated`
  Postgres role, so a column-level hide can't distinguish them. It's revoked from
  `anon`, and the API never returns it to students; an enrolled student's row-level
  read of *their own* batch still technically exposes it. Acceptable (they already
  belong to that batch); tighten later if a per-role split is introduced.
- **Legacy `/home` builder** writes quizzes/questions directly from the browser
  (an anti-pattern this work discourages). Teacher write policies use `is_teacher()`
  (not owner-scoped) so that page keeps working; scope to `teacher_id` once `/home`
  is retired.

## D12 — Admin late/missed reporting (spec §F7) — DONE
- `GET /api/tests/[id]/results` (teacher-only) reports **per enrolled student**, not
  just those who attempted, so non-attempters surface: the row set is the test's
  `student_batches` cohort, left-joined to `quiz_attempts`. Missing attempt →
  `missed` if the window has closed, else `pending`.
- **Outcome is derived server-side** from the attempt + window phase (`utils/test.ts`,
  reused from D10): `on_time` / `late` (from the stored `is_late`) / `in_progress`
  (started, window open) / `expired` (started, window closed, never submitted) /
  `missed` / `pending`. No status is trusted from the client.
- **No service role needed here:** teachers already have an RLS SELECT policy on
  `quiz_attempts`/`profiles`/`student_batches` (D11), and the report never reads
  answer columns — so the teacher's user-scoped client is sufficient. Ownership is
  enforced (`quiz.teacher_id === user.id`, else 404 to avoid leaking existence).
- UI at `/admin/quizzes/[id]`: roll-up stat cards + a filterable/sortable antd
  `Table`; reached via a **View results** action on the `/admin/quizzes` list.

## D13 — Students roster + detail (spec §F5) — DONE
- `GET /api/students` (teacher-only): all `role='student'` profiles, joined to
  enrolled batches + attempt stats (#submitted, last activity), and enriched with
  **email/phone from `auth.users`** — which live outside `profiles` and are readable
  only via the **service role** (`utils/students.ts#contactsById`, paged
  `auth.admin.listUsers`, capped at 50 pages). Contact details are teacher-only and
  never returned to a student session.
- `GET /api/students/[id]`: profile + contact + enrolled batches + full **test
  history** across all published/closed tests in those batches. Missed/late flags
  reuse `deriveOutcome` (below), and because the history is the *assignable set*
  (not just attempts), tests the student never started surface as `missed`.
- **Refactor:** the per-student outcome vocabulary (`on_time`/`late`/`in_progress`/
  `expired`/`missed`/`pending`) moved from the F7 results route into
  `utils/test.ts#deriveOutcome` so the report (F7) and the student history (F5)
  derive it identically. Still pure + server-authoritative.
- UI: `/admin/students` (searchable by name/email/phone + batch filter, row → detail)
  and `/admin/students/[id]` (profile card + roll-up stats + history table). antd.

## D14 — Batch detail/edit + enroll UI (spec §F2) — DONE
- **`/admin/batches/[id]` detail hub (antd, new screen):** batch `Descriptions` +
  roll-up stats + an **enrolled-students** table (add via `Select` of unenrolled
  students, remove via `Popconfirm`) + the batch's **tests** table (row →
  `/admin/quizzes/[id]`, reusing the F7 results page). **Edit batch** button →
  `/admin/batches/[id]/edit`.
- **`/admin/batches/[id]/edit` (antd, new screen):** `Form` initialised from
  `GET /api/batches/[id]`, submits `PUT /api/batches/[id]` (which already existed).
  The `/admin/batches` list's Edit icon now resolves (was a dead link).
- **List stays Tailwind (D2):** only added **Students/Tests count** columns and a
  detail link on the name cell — no rewrite. Counts come from `GET /api/batches`,
  which now tallies `student_batches`/`quizzes` per batch (additive fields
  `student_count`, `test_count`).
- **Enroll/remove go through the service role.** `student_batches` has an RLS SELECT
  policy but **no browser write policy** (D11), so `POST`/`DELETE
  /api/batches/[id]/students` write via `createAdminClient()` — same pattern the
  registration flow already uses. Both guard `requireTeacher` **and** batch ownership
  (`teacher_id === user.id`, else 404, no existence leak — mirrors the results route),
  and verify the target profile is a student. Enroll is idempotent (unique-violation
  `23505` swallowed).
- **Removal hard-deletes the junction row.** The enrollment link carries no
  history of its own — results live in `quiz_attempts` keyed by quiz+student and are
  untouched by un-enrolling — so the soft-delete rule doesn't apply to it.
- `GET /api/batches/[id]` extended **additively** to also return `students`
  (enrolled, with email/phone via `contactsById`), `available_students` (unenrolled),
  and `tests`; the batch fields the edit form reads are unchanged.

## D15 — Public leaderboard (spec §F8) — DONE
- **`GET /api/public/leaderboard` — no auth, service role.** RLS restricts
  `quiz_attempts`/`profiles` to the owning student or a teacher, so a public,
  session-less ranking can't be built with a user-scoped client. It reads through
  `createAdminClient()` (service role, bypasses RLS) and returns **only public-safe
  fields** — `full_name` + aggregate scores. Never email/phone/answers/`correct_answer`.
- **Metric (the documented default):** rank by **total points = Σ `score` over
  `submitted` attempts**, tie-broken by **overall accuracy**
  (`Σ correct_count / Σ (questions in the taken tests)`), then **earliest submission**.
  Accuracy uses a real question-count denominator (one grouped `questions` query),
  not `score/max_score`, so negative marking doesn't distort the accuracy tiebreak.
- **Computed live per request** (no materialized table) — simple and always current
  as results come in; fine at coaching-center scale. Revisit with a cached/rollup
  table only if attempt volume makes the per-request aggregation slow.
- **Batch filter:** optional `?batch=<id>` restricts the ranking to that batch's
  tests (quiz→batch map built server-side). UI is an antd `Select` fed by the
  existing `GET /api/public/batches`.
- **UI `/leaderboard` (antd, public):** lives OUTSIDE the `(protected)` group so
  middleware (which only gates `/admin` + `/student`) lets it through with no
  session; ranked `Table` with top-3 medals. Linked from the landing page.

## D16 — Admin dashboard + retire mock `/teacher` (spec §F9) — DONE
- **`/admin` is now a live antd dashboard**, replacing the one-line stub: three
  `Statistic` cards (total batches, total students, published tests / total) + two
  "recent" lists (latest 5 batches → detail page, latest 5 tests → results page) +
  quick-create actions. **No new API** — it composes the existing `GET /api/batches`
  (which already carries `student_count`/`test_count` from D14), `GET /api/students`,
  and `GET /api/tests`, fetched in parallel client-side.
- **Mock `/teacher` page retired.** It shipped hardcoded `MOCK_BATCHES`/`MOCK_QUIZZES`
  and an `alert()` — exactly the "no mock data / no dead paths" smell the DoD forbids.
  Rather than delete the route (the landing page's "Teacher" role card links to it),
  it now `redirect()`s to `/admin`, so authed teachers land on the real dashboard and
  unauthed visitors still hit the middleware → `/login` bounce.
- Kept it teacher-only implicitly: `middleware.ts` already gates `/admin`, and every
  API it calls enforces `requireTeacher`, so an empty/500 state is the worst a
  non-teacher could see (they can't reach the page anyway).

## D17 — UI consistency pass: complete design tokens, role-aware nav, shared container
A cross-cutting "simple, premium, consistent, mobile-first" pass. Deliberately kept
within AGENTS §2: **no system swaps** — Tailwind pages stay Tailwind, antd pages stay
antd — so the two systems still coexist by design (see D2).
- **Root cause of the "half-styled" look:** `globals.css` mapped only three tokens
  (`background`/`foreground`/`primary`) into Tailwind's `@theme`, but the Tailwind
  pages were already written against `muted`, `muted-foreground`, `border`,
  `primary-foreground`, `card`, `ring`. Those classes silently produced no style.
  Fix = declare the **full token palette** (zinc neutrals + brand blue, light+dark)
  once in `globals.css`; every Tailwind page picks up the correct look with no page
  edits. This is the source of truth for both systems' colours (antd's `colorPrimary`
  in `AntdProvider` is set to the same `#2563eb`).
- **Nav is now role-derived from the path**, not a fixed admin bar shown on every
  protected route. Students no longer see admin links; `/` shows a minimal bar; a
  real **Sign out** was wired to the existing `/api/auth/logout`; the dead
  `/admin/settings` link and no-op bell were removed. Kept it path-based (not a role
  fetch) to avoid an extra round-trip in a client component — the server still
  enforces access via `middleware.ts`.
- **`components/layout/PageContainer.tsx`** standardises max-width + a fluid
  mobile-first gutter for the antd screens (was per-page hardcoded `padding:24`).
  antd `Table`s get `scroll={{ x: "max-content" }}` so they scroll within their card
  on phones instead of overflowing the viewport.

## D18 — Student registration gates on the per-batch enrollment code (spec §F1) — DONE
**Bug:** students couldn't sign in with the secret their teacher gave them. The
teacher hands out a **batch's `secret_pass`** (the per-batch enrollment code that
DATA-MODEL — the source of truth — has always documented, and that the signup field
labels "Provided by your teacher"), but `app/api/auth/register` validated the entered
code against a single **global** `REGISTRATION_SECRET_PASS` env var. Any student
entering their batch code got `Invalid secret password` (400) → no account → couldn't
log in. F1/ARCHITECTURE described the global-secret design; DATA-MODEL described the
per-batch one. They contradicted.

**Resolution — reconcile toward the per-batch code** (DATA-MODEL wins as source of
truth, and it's the more meaningful design: each batch has its own teacher-managed
code):
- `POST /api/auth/register` now **requires `batchId`**, looks up that batch via the
  service role, rejects a missing/archived batch, and compares the entered
  `secretPass` to **that batch's `secret_pass`**. Wrong code → 400.
- `REGISTRATION_SECRET_PASS` is kept only as an **optional global master override**
  (accepted for any batch) so existing deployments and an admin "skeleton key" still
  work; unset ⇒ only the per-batch code is accepted. Additive, non-breaking.
- **Hardening while here:** the secret is validated **before** any user is created;
  duplicate email → friendly 409 (was a raw 500); if the profile/enrollment insert
  fails after `auth.users` creation, the orphaned auth user is best-effort deleted so
  a retry isn't blocked by "email already registered"; batch code compared without
  leaking whether the batch exists.
- No schema change (DATA-MODEL already had `batches.secret_pass`). Docs updated
  first: FEATURES F1 (now ✅), ARCHITECTURE §3, `.env.example`.

## D19 — Reliable logout so one device can switch accounts (spec §F1) — DONE
**Bug:** on a single device you couldn't cleanly log out and sign in as the other
role (teacher ↔ student). `POST /api/auth/logout` called `supabase.auth.signOut()`
with the **default `scope:'global'`**, which does a token-revoke round-trip to
Supabase; on any non-401/404 error it threw and the route returned **500**.
`AppShell`'s Sign-out did `await fetch(...)` but ignored the result and then
**soft-navigated** (`router.push` + `refresh`). If the cookies hadn't cleared,
`middleware.ts` still saw a valid user and **redirected /login back to the old
dashboard** — Sign-out looked like it did nothing, and the switch was impossible.

**Resolution — make logout always end in a signed-out browser:**
- Logout route now uses **`scope:'local'`** (this device only; never revokes the
  user's other devices, doesn't hinge on the global-revoke call), **swallows any
  `signOut` error**, and as a safety net **explicitly expires every Supabase auth
  cookie** (`sb-*…-auth-token`, incl. chunked `.0`/`.1`) via the cookie store, so
  the session is gone even if the SSR client couldn't clear it. Always returns 200.
- `AppShell.logout` switched `push`→**`router.replace('/login')`** (+ `refresh`) so
  Back can't return to a signed-out screen and the RSC cache is invalidated; the
  now-reliable cookie clearing means a soft nav is sufficient (this Next lints
  against `window.location.assign` for internal nav, so no hard reload).
- No schema/API-contract change; logout response shape unchanged (additive-safe).
  Docs updated first: FEATURES F1 Notes.

## D20 — Batch carries class timing (start/end), not a course (spec §F2) — DONE
**Change:** the maintainer replaced the batch's free-text `course` with a structured
**class timing** — `start_time` and `end_time` (Postgres `TIME`, time-of-day). A
coaching batch is identified by *when it meets* (e.g. the "6–8 PM batch"), not a course
name, so timing is the more useful, filterable attribute.

**Resolution:**
- **Migration is additive & non-destructive** (AGENTS.md §2: never drop a column other
  code has read). New migration `..20260917120000_batch_timing.sql` adds `start_time`/
  `end_time` (`ADD COLUMN IF NOT EXISTS`) and **drops the `NOT NULL` on `course`** so new
  inserts no longer supply it. The `course` column is **left in place, nullable, and
  unused** — no rename/drop, so any older row keeps its data and nothing breaks on re-run.
- **Both times required** on create/edit (mirrors course's old required status). Stored as
  `HH:MM` strings; native `<input type="time">` on both the Tailwind create page and the
  antd edit form (antd `<Input type="time">`) — **no new dep** (avoids antd `TimePicker`'s
  `dayjs`, which is only a transitive dependency).
- **Display** via new `utils/batch.ts#formatBatchTiming(start,end)` → `"6:00 AM – 8:00 AM"`
  (12-hour, seconds stripped, null-safe). Used by the batch list/detail/dashboard, student
  detail, and the batch `<Select>` labels on leaderboard / signup / quiz-wizard.
- **API contract stays additive-compatible**: `course` removed from the accepted/returned
  field set, `start_time`/`end_time` added; `/api/public/batches` now exposes
  `id,name,start_time,end_time` (still no `secret_pass`).
- Docs updated first: DATA-MODEL batches table, FEATURES F2.

## D21 — Tests are startable anytime after schedule; teacher-close is the only lock (spec §F6) — DONE
**Change (maintainer request):** a student who misses a test's scheduled time should
still be able to take it later. The old model (D10) hard-locked a test at
`hardClose = due + LATE_GRACE_MINUTES` and marked non-attempters `missed`, so a
student who logged in a few minutes late was permanently shut out.

**Resolution — remove the time-based lock; keep late tracking:**
- **Phase now keys off quiz status, not the clock.** `computePhase(timing, now,
  status)` returns `closed` **only** when `quizzes.status === 'closed'`, `upcoming`
  before `scheduled_at`, otherwise `open`. A published, past-scheduled test is `open`
  indefinitely. The `status` arg is optional (defaults to open-after-schedule), so
  every existing 2-arg caller keeps working.
- **Full personal duration.** `personalDeadline(startedAt, duration) = startedAt +
  duration` — the old `min(…, closesAt)` cap is gone, so a late starter still gets
  their whole `duration_minutes`. Dropped the now-unused `timing` arg from the
  signature and updated all call sites (start / submit / take-page GET+PATCH).
- **Lateness unchanged:** `is_late = submitted_at > due` still holds, so F7 reporting
  keeps its on-time/late split. `LATE_GRACE_MINUTES` no longer gates anything; it
  survives only as the informational `closesAt = due + grace` field in the results JSON.
- **`missed`/`expired` re-pointed:** with no time lock, `deriveOutcome` yields `missed`
  (no attempt) / `expired` (unfinished attempt) only once the teacher closes the test;
  a non-attempter on an open test is `pending`. No signature change — the meaning of
  the `closed` phase it receives is what moved.
- **Closing is the admin's lock:** setting a quiz `closed` blocks new starts (start
  route still 403s on `closed`); an already in-progress attempt runs its duration out.
- Docs updated first: DATA-MODEL timing model, FEATURES F6 (+F7 note). Additive only —
  no schema/migration change and the API JSON stayed additive-compatible.

## D22 — Admin can edit & delete a test (F3 completion)

**Context:** F3 shipped test *creation* (wizard) + results, but a teacher could
neither edit a test after creating it nor remove one — the `/admin/quizzes` list
only linked to results. Requested: complete the feature so admins can edit and
delete tests.

**Edit (`PUT /api/tests/[id]` + `/admin/quizzes/[id]/edit`):**
- **Settings** (title, batch, exam level, `scheduled_at`, duration, marks scheme,
  passing marks, `status`) are always editable. `status` drives the publish/close
  lifecycle; `is_published` is kept mirrored (`status !== 'draft'`).
- **Questions** may be replaced only while the test has **zero `quiz_attempts`**.
  Once any student has attempted, replacing questions would silently invalidate
  already-computed scores, so the API refuses (409) and the edit UI renders the
  questions read-only with a notice. Settings can still be edited (incl. closing).
- Question replace is delete-all-then-insert within the same request (mirrors the
  POST insert shape); reuses the wizard's MCQ editor component contract.
- The edit form must show `correct_answer`/`explanation`, which are SELECT-revoked
  from the browser JWT (D11/F10), so `GET /api/tests/[id]` reads questions through
  the **service-role** client after `requireTeacher` + ownership (404 on mismatch).

**Delete (`DELETE /api/tests/[id]`):** follows the app-wide "soft-delete anything
with history" rule.
- **No attempts →** hard-delete the quiz (its `questions` cascade). Nothing to keep.
- **Has attempts →** soft-delete by setting `quizzes.archived_at = now()` (never
  destroy the row) so results (F7) and the leaderboard (F8) keep working. Archived
  tests are filtered out of `GET /api/tests` and hidden from students via RLS.

**Why not add an `archived` enum value?** The `quizzes_select_student` policy is
`(is_published OR status <> 'draft')`; an `archived` status would still satisfy
`status <> 'draft'` and leak to students. A nullable `archived_at` column
(migration `20260917140000_quiz_archive.sql`, mirrors `batches.archived_at`) plus an
`archived_at IS NULL` guard added to the student `quizzes`/`questions` SELECT
policies is additive, idempotent, and can't leak. No column renamed/dropped.

**Verify:** typecheck / lint(changed) / build pass; not click-tested (no `.env`).

## D23 — Multi-batch signup (one code → all selected) + header batch switcher (F1) — DONE

**Context:** a student at a coaching center often attends more than one batch.
Requested: let a student (a) pick **multiple** batches at signup while entering
just **one** enrollment code, (b) switch which batch they're viewing from the app
header, and (c) be added/removed from a batch by the teacher (already shipped in
D14 — `/admin/batches/[id]` + `POST/DELETE /api/batches/[id]/students`; no change).

**Signup — multiple batches, one code (`POST /api/auth/register`):**
- Body now takes `batchIds: string[]` (legacy single `batchId` still accepted → an
  array of one, non-breaking). All selected batches must exist and be `active`
  (else 400 before any account is created).
- The one entered `secretPass` is accepted if it equals the `secret_pass` of **any**
  selected batch, or the optional `REGISTRATION_SECRET_PASS` master override. On
  success the student is enrolled in **all** selected batches (single bulk insert;
  `23505` treated as idempotent). No schema change — `student_batches` is already m2m.
- `/signup` swaps the single `<select>` for a checkbox list; the code field label
  says "for any one selected batch".

**Security tradeoff (accepted, product decision):** requiring only one matching code
means a student who knows **one** batch's code can enroll into the **others** they
select in the same signup, weakening the per-batch gate from D18. This was chosen
deliberately for UX at a single-teacher center where the teacher controls the codes
and the roster (and can remove mis-enrollments). The safer alternative — enroll only
in batches whose code matches — was rejected as too fiddly for the operator. Teacher
add/remove (D14) remains the authoritative roster control.

**Header batch switcher:**
- `GET /api/student/batches` returns the student's enrolled batches (RLS-scoped;
  public-safe fields only, never `secret_pass`).
- `components/providers/BatchProvider.tsx` (mounted in the root layout inside
  `AntdProvider`) fetches those batches lazily **only on `/student` routes** and
  holds the active selection in state + localStorage (`null` = "All batches"). A
  stale selection (student removed from that batch) reconciles to "All".
- `AppShell.tsx` renders a header `<select>` **only** when `section === "student"`
  and the student has **>1** batch. The `/student` dashboard filters its test list
  by the active batch (rows now carry `batch_id`); one-batch students are unaffected.

**Verify:** `npx tsc --noEmit` clean. Not click-tested (no `.env` in repo).

## D24 — Study Material: teacher PDF notes shared to a batch (F13) — DONE

**Context:** the maintainer asked for a new **Study Material** feature — a teacher
shares material with a batch; students of that batch can see and download it. For
now only the **Notes** kind (a PDF with title + description); more kinds come later.
F12 already stubbed a "Study Material" card on the student home as *Coming soon* —
this makes it live.

**Storage — private Supabase Storage bucket + signed URLs (not a public bucket, not
base64-in-DB):**
- PDF bytes go in a new **private** `study-material` bucket (created idempotently by
  the migration, guarded by a `DO` block that no-ops if the `storage` schema is
  absent, so the SQL is safe on a bare Postgres). Metadata (title, description,
  `file_path`, size, mime, `kind`) lives in a new `study_materials` table.
- **All object access is server-side via the service role:** uploads on `POST`, and
  a short-lived (~60 s) **signed URL** minted on download *after* the caller is
  authorized. A public bucket would leak any file to anyone with the URL; base64 in
  Postgres bloats the row and the API JSON. Signed URLs keep the bytes private while
  letting the browser download directly from storage (no proxying multi-MB files
  through the Node route).
- **No `storage.objects` RLS policies needed:** because every object op goes through
  the service-role client (which bypasses storage RLS), the bucket stays closed to
  the browser and we don't maintain a parallel storage policy set. The
  `study_materials` **table** still gets full RLS (teacher CRUD; student SELECT
  enrolled + non-archived), mirroring the app's defense-in-depth pattern (D11).

**Authorization — enrollment re-checked on every download:** the shared
`GET /api/study-materials/[id]/download` (`requireUser`) loads the row via the
service role, then authorizes in code: an owning teacher, or a student whose
`student_batches` contains the material's `batch_id` (else 403/404). Only then is a
signed URL minted. So access follows enrollment live — remove a student from the
batch and their next download 403s — and a leaked short-lived URL can't be replayed
for long.

**Hard-delete (not soft-delete):** the app-wide rule is "soft-delete anything with
results/history" (AGENTS §2). A study material is just a file — it has no attempts,
scores, or leaderboard bearing — so `DELETE` **hard-deletes**: remove the storage
object, then the row. A reserved `archived_at` column (+ `archived_at IS NULL` in
the student SELECT policy) is added anyway so a future soft-delete (e.g. if
materials ever gain view history) needs no migration; it's simply unused today.

**Extensibility:** `kind` is free **text** defaulting to `notes`, not an enum — the
maintainer explicitly plans more material types. A new kind is additive (no
migration, no enum ALTER); the current UI/API just fix `kind='notes'`.

**Discoverability & nav:** the F12 student-home "Study Material" card goes from
disabled to routing at `/student/study-material`; `appNav.ts` gains a **Study** tab
for both admin and student sections (+ app-bar titles). The student list respects
the header batch switcher (D23) by filtering to the active batch client-side.

**Verify:** `npx tsc --noEmit` clean · `npx eslint` (changed files) clean · `npx
next build` passes. Not click-tested live (no `.env`/Supabase Storage in the repo);
the upload/download path needs your own Supabase project with the migration applied.

## D25 — Study Material becomes subject-organized; notes accept PDF **or** image (F13) — DONE

**Context:** the maintainer refined F13: instead of a flat list of PDFs on a batch,
a teacher should **add a subject to a batch** and file notes **subject-wise** (title,
description, **image or PDF**); students should see subjects as a **folder list** and
open a folder to read that subject's notes.

**Schema — a `subjects` folder table + a nullable `subject_id`, batch_id kept
denormalized:**
- New `subjects(batch_id, teacher_id, name, archived_at)` hangs off `batches`. A
  `study_materials` row gains `subject_id` (FK, `ON DELETE CASCADE`). It is
  **nullable** so the migration is additive (any legacy pre-subject row stays valid;
  such rows simply don't appear in a folder).
- `study_materials.batch_id` is **kept and denormalized** to the subject's batch
  rather than dropped. This is deliberate: the D24 RLS (`is_enrolled(batch_id)`) and
  the download route's enrollment check both key off `batch_id`, so keeping it means
  **no change** to answer-secrecy-grade access code — the subject is just an extra
  grouping layer above the same batch-scoped authorization. The server sets
  `batch_id` from the subject on insert; the client never picks it independently.
- Reuses the D24 private `study-material` bucket. Object path gains the subject
  segment and the real extension: `<batch_id>/<subject_id>/<uuid>.<ext>`.

**Files — PDF or image, validated server-side:** `POST /api/study-materials` now
accepts `application/pdf` **and** common `image/*` types (`png`, `jpeg`, `webp`,
`gif`, `svg` blocked — script risk), ≤ 25 MB, checked on both the client (fast
feedback) and the server (authoritative). The extension is derived from the mime so
the stored object + signed-download filename stay sensible. `kind` stays `notes`.

**Subjects API mirrors the notes API's guards:** `POST /api/subjects` verifies the
batch belongs to the teacher; `DELETE /api/subjects/[id]` is a hard-delete (a folder
has no results/history) that first removes its notes' storage objects (best-effort)
so the FK cascade can't orphan bytes. `GET /api/subjects` / `GET /api/student/subjects`
return note counts so the folder cards can show them. The student notes list is now
`?subject=`-scoped and **re-checks** the student is enrolled in that subject's batch
before returning rows (defense-in-depth over RLS).

**UI:** admin `/admin/study-material` becomes batch → subject folders → notes (Add
subject / Add notes / delete both). Student `/student/study-material` is a folder
grid; a new `/student/study-material/[subjectId]` lists a folder's notes. The header
batch switcher (D23) still filters. Nav/titles updated in `appNav.ts`.

**Verify:** `npx tsc --noEmit` clean · `npx eslint` (changed files) clean · `npx
next build` passes. Not click-tested live (no `.env`/Supabase Storage in the repo).

## D27 — Dual file storage: Supabase + Cloudinary, switchable per env (F13/F14) — DONE

**Context (maintainer request):** file uploads (Study-Material notes F13, `file`-kind
Homework F14) go to a private Supabase Storage bucket. The **Supabase free tier caps
storage**, so once it fills up the maintainer wants NEW uploads to go to **Cloudinary**
instead — without breaking the files already on Supabase and without a code change per
upload. "Manage the file upload on both."

**Resolution — a provider-agnostic storage layer + a per-row provider stamp:**
- **`utils/storage.ts`** abstracts the private store behind three server-only calls —
  `uploadObject`, `signedUrl`, `removeObjects` (+ `toStoredFile`, `activeUploadProvider`).
  Both features call these instead of touching `supabase.storage` directly, so a single
  place knows about both backends. Study-Material (upload/download/delete + subject-delete)
  and Homework (`file` upload/download/delete) routes were rewired to it; behaviour and
  the download JSON (`{ url }`) are unchanged.
- **`STORAGE_PROVIDER` env chooses where NEW uploads land** (`supabase` default |
  `cloudinary`). Flip it to `cloudinary` when Supabase fills up — no redeploy of logic,
  just config + the three `CLOUDINARY_*` secrets.
- **Every file row records its own provider** — new `storage_provider` column on
  `study_materials` and `homework` (migration `20260918160000_storage_provider.sql`,
  additive/idempotent, default `supabase`, CHECK-constrained). Download/delete **dispatch
  per-row**, not per-env, so files uploaded to Supabase before the switch keep serving
  from Supabase forever, and Cloudinary files serve from Cloudinary — the two coexist.
- **`file_path` is now provider-relative:** a Supabase object path, or a Cloudinary
  `public_id`. The DB column and its meaning are otherwise unchanged (additive).

**Cloudinary specifics (why these choices):**
- Files are uploaded as **private `authenticated` `raw` assets.** `raw` stores the
  original bytes untouched and dodges Cloudinary's default block on delivering PDFs
  (which `image`-type PDF delivery hits); `authenticated` means a raw guessed URL 401s —
  a **signed** URL is required, mirroring Supabase's private bucket. The `public_id`
  carries the real extension so type/name survive.
- **Download** mints an **expiring** signed link via `private_download_url` (forces an
  attachment, preserves the original filename). **Inline view** uses a signed
  `authenticated` delivery URL. Both are unguessable; as with Supabase, the route
  **re-authorizes on every request** (owning teacher / enrolled student) before minting.
- **Tradeoff:** the inline-view delivery URL is signature-protected but not
  time-limited unless the Cloudinary account enables token-based auth (the download link
  *does* expire). Acceptable: access is still gated by the authorized route + an
  unguessable signature, and it matches standard Cloudinary private-asset usage. Also,
  a `raw` PDF may download rather than render inline in some browsers — the Download
  button is unaffected. Used the official `cloudinary` SDK (v2) rather than hand-signing
  URLs, since the signature rules are fiddly and can't be verified here without live keys.

**Security unchanged:** neither store is public; the service role / Cloudinary secrets
never reach the browser; the download route authorizes before every mint. No RLS change
(the metadata tables' policies already gate the rows; the bytes were never browser-reachable).

**Verify:** `npx tsc --noEmit` clean · `npx eslint` (changed files) clean · `npx next
build` passes. Not click-tested live (no `.env`/Supabase/Cloudinary keys in the repo);
the Cloudinary path needs a Cloudinary account + `STORAGE_PROVIDER=cloudinary`.

## Open items (next passes)
- When the legacy `/home` browser-write builder is retired, tighten the teacher
  quizzes/questions write policies from `is_teacher()` to owner-scoped
  (`teacher_id = auth.uid()`).
- `/home` (legacy builder) still uses off-brand raw colours and has no dark mode;
  fold it into the design tokens or retire it in the same pass.

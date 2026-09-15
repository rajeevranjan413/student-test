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
  + `examLevel` + `extraPrompt` (legacy `image`/`prompt` still accepted), and
  returns validated questions in the spec JSON shape. Malformed candidates are
  dropped; unreadable responses return a 502 the UI can retry.

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

## Open items (next passes)
- When the legacy `/home` browser-write builder is retired, tighten the teacher
  quizzes/questions write policies from `is_teacher()` to owner-scoped
  (`teacher_id = auth.uid()`).

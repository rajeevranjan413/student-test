# Data Model

> The **source of truth is `supabase/migrations/**`.** This file is the readable
> reference; keep it in sync when you add a migration. All tables are Postgres.
> Access control lives in the API layer **and** is backed by RLS (migration
> `20260915140000_enable_rls.sql`) — see the RLS section below.

## Entity map

```
auth.users ─1:1─ profiles ─┬─< student_batches >─┬─ batches ─< quizzes ─< questions
                           │                     │              │
                           └────< quiz_attempts >┘              └──(attempts reference quizzes)
```

- A **profile** is a user (student or teacher).
- A **batch** groups students (m2m via `student_batches`) and is owned by a teacher.
- A **quiz** (= the spec's "Test") belongs to a batch; it has many **questions**.
- A **quiz_attempt** is one student's single attempt at one quiz.

## Enums

| Enum | Values |
|---|---|
| `user_role` | `student`, `teacher` |
| `quiz_status` | `draft`, `published`, `closed` |
| `attempt_status` | `in_progress`, `submitted`, `missed` |
| `batch_status` | `active`, `archived` |

## Tables

### profiles
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | → `auth.users(id)` on delete cascade |
| `role` | user_role | not null |
| `full_name` | text | display name (also used publicly on the leaderboard) |
| `created_at` | timestamptz | |

Email/phone live in `auth.users` (query via service role when the admin needs them).

### batches
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | not null |
| `course` | text | not null |
| `teacher_id` | uuid | → profiles, owner |
| `secret_pass` | text | **unique**; per-batch enrollment code (never exposed publicly) |
| `description` | text | optional |
| `exam_level` | text | optional |
| `start_date` | timestamptz | optional |
| `status` | batch_status | default `active`; archive instead of delete |
| `archived_at` | timestamptz | set when archived |
| `created_at` | timestamptz | |

### student_batches (junction, m2m)
| Column | Type | Notes |
|---|---|---|
| `student_id` | uuid | → profiles |
| `batch_id` | uuid | → batches |
| PK | (`student_id`,`batch_id`) | |

### quizzes (a.k.a. Test)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | not null |
| `batch_id` | uuid | → batches |
| `teacher_id` | uuid | → profiles, creator |
| `exam_level` | text | |
| `scheduled_at` | timestamptz | window opens here |
| `duration_minutes` | int | default 30; time a student gets once started |
| `total_questions` | int | target required at creation |
| `marks_per_question` | int | default 1 |
| `negative_marking` | numeric | default 0 |
| `passing_marks` | int | optional |
| `status` | quiz_status | default `draft` |
| `is_published` | bool | legacy flag, mirrored from `status` |
| `created_at` | timestamptz | |

### questions (only APPROVED questions are stored)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `quiz_id` | uuid | → quizzes on delete cascade |
| `question_text` | text | not null |
| `options` | jsonb | `[{ "key":"A", "text":"..." }]` (4 items) |
| `correct_answer` | text | the correct option **key** (e.g. `"B"`) |
| `explanation` | text | optional |
| `difficulty` | text | `easy`\|`medium`\|`hard` |
| `order` | int | display order within the quiz |
| `source_image_ref` | text | optional provenance |
| `created_at` | timestamptz | |

> **Answer secrecy:** `correct_answer` must never be included in any response used
> while a student is taking the test. Select it only in teacher/grading contexts.
> This is now enforced at the DB: `correct_answer` and `explanation` are
> column-REVOKEd from `anon`/`authenticated`, so only the **service-role** client
> (`utils/supabase/admin.ts`) can read them. See the RLS section.

### quiz_attempts (one attempt per student per quiz)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `quiz_id` | uuid | → quizzes |
| `student_id` | uuid | → profiles |
| `started_at` | timestamptz | real start time |
| `submitted_at` | timestamptz | set on submit / auto-submit |
| `is_late` | bool | default false |
| `status` | attempt_status | default `submitted` (`in_progress` while taking) |
| `score` | int | nullable until graded |
| `max_score` | int | nullable until graded |
| `correct_count` | int | |
| `answers` | jsonb | `[{ "questionId":"…", "selectedOptionKey":"A" }]` |
| `created_at` | timestamptz | |
| **unique** | (`quiz_id`,`student_id`) | **DB-level single-attempt guarantee** |

## Attempt timing model (canonical)

Let `open = scheduled_at`, `end = scheduled_at + duration_minutes`, and
`hardClose = end + LATE_GRACE_MINUTES` (`utils/constants.ts`, default 15).

| Now vs window | Student can start? | Flag |
|---|---|---|
| `now < open` | No — locked, show countdown | — |
| `open ≤ now ≤ end` | Yes | on-time |
| `end < now ≤ hardClose` | Yes (grace) | `is_late = true` |
| `now > hardClose`, no attempt | No | `missed` |

- One attempt only — enforced by the unique constraint **and** re-checked server-side.
- Timer = `min(duration_minutes, time until hardClose)` from the real `started_at`;
  auto-submit at zero. All timing validated server-side; the client clock is untrusted.
- The shared timing helper is expected at `utils/test.ts` (planned) so the start/
  submit endpoints and the student UI agree on one implementation.

## Row-Level Security (RLS)

Enabled on all six tables by `20260915140000_enable_rls.sql`. It backs the API
(defense-in-depth) — the Route Handlers still enforce the business rules, but a
raw browser query can no longer bypass them.

| Table | `authenticated` (browser JWT) can… |
|---|---|
| `profiles` | SELECT own row; teacher SELECTs all. No client writes. |
| `batches` | teacher: full CRUD; student: SELECT enrolled batches only. `secret_pass` revoked from `anon`. |
| `student_batches` | student SELECTs own enrollments; teacher SELECTs all. Writes via service role (registration **and** the admin enroll/remove UI, `/api/batches/[id]/students`). |
| `quizzes` | teacher: full CRUD; student: SELECT published tests in enrolled batches. |
| `questions` | teacher: full CRUD; student: SELECT body of takeable questions. **`correct_answer`/`explanation` column-REVOKEd from everyone but service role.** |
| `quiz_attempts` | student/teacher SELECT (own / all). **No client writes** — inserts & updates go through the service role. |

- **Roles:** `anon` (public, no session), `authenticated` (students *and* teachers
  share this one Postgres role — role split is via the `is_teacher()` helper, not
  separate DB roles), `service_role` (server-only key; **bypasses RLS + column
  grants**).
- **Helpers:** `public.is_teacher()` and `public.is_enrolled(batch_id)` are
  `SECURITY DEFINER` so policies can check role/enrollment without recursing.
- **Service-role usage** (`utils/supabase/admin.ts`): reading answer columns
  (scoring / post-submit review) and **all** `quiz_attempts` writes. Callers must
  already have passed `requireStudent`/`requireTeacher`.

## Open items
- No `GenerationLog` table yet (optional AI auditing from the spec).
- Public leaderboard read path should use the service role (public, no session).

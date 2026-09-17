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
- A **study_material** is a file (today a PDF, `kind='notes'`) a teacher shares to a
  batch; every enrolled student can view/download it. It hangs off `batches` like
  quizzes do (`batch ─< study_materials`).

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
| `start_time` | time | class start time-of-day (the "batch timing") |
| `end_time` | time | class end time-of-day |
| `teacher_id` | uuid | → profiles, owner |
| `secret_pass` | text | **unique**; per-batch enrollment code (never exposed publicly) |
| `description` | text | optional |
| `exam_level` | text | optional |
| `start_date` | timestamptz | optional (calendar start date — distinct from `start_time`) |
| ~~`course`~~ | text | **deprecated** — kept nullable for back-compat; no code reads/writes it (replaced by `start_time`/`end_time`) |
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
| ~~`exam_level`~~ | text | **deprecated** — kept nullable for back-compat; no code reads/writes it (the "Exam / level" field was removed from create/edit test). |
| `scheduled_at` | timestamptz | window opens here |
| `duration_minutes` | int | default 30; time a student gets once started |
| `total_questions` | int | target required at creation |
| `marks_per_question` | int | default 1 |
| `negative_marking` | numeric | default 0 |
| `passing_marks` | int | optional |
| `status` | quiz_status | default `draft` |
| `is_published` | bool | legacy flag, mirrored from `status` |
| `archived_at` | timestamptz | set when a test with attempts is soft-deleted; hidden from students (RLS) and the teacher list. `NULL` = live |
| `created_at` | timestamptz | |

> **Deleting a test:** a test with **no** attempts is hard-deleted (its `questions`
> cascade). A test that already has `quiz_attempts` is **soft-deleted** by setting
> `archived_at` (never destroyed) so results/leaderboard history survive. See D22.

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

### study_materials (teacher-shared resources for a batch)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `batch_id` | uuid | → batches on delete cascade; the batch the material is shared with |
| `teacher_id` | uuid | → profiles, uploader |
| `kind` | text | default `notes`. The material **type**; `notes` (a PDF) is the only kind today. Kept as free text (not an enum) so future kinds — videos, links, assignments — are additive with no migration. |
| `title` | text | not null; shown to students |
| `description` | text | optional blurb |
| `file_path` | text | not null; the object path **inside** the private `study-material` storage bucket (e.g. `<batch_id>/<uuid>.pdf`). Never a public URL. |
| `file_name` | text | not null; the original upload filename, used as the download filename |
| `file_size` | bigint | bytes (for display) |
| `mime_type` | text | e.g. `application/pdf` |
| `archived_at` | timestamptz | reserved for a future soft-delete; `NULL` = live. Today the API **hard-deletes** a material (a file carries no results/history), but the column + student policy guard exist so soft-delete can be added without a migration |
| `created_at` | timestamptz | |

> **File hosting:** the PDF bytes live in a **private Supabase Storage bucket**
> (`study-material`), created by the same migration. All object access is
> server-side through the **service-role** client: uploads on `POST`, and
> short-lived **signed URLs** (~60s) minted on download after the caller is
> authorized (owning teacher, or a student enrolled in `batch_id`). The bucket is
> **not public** — a raw object URL never works, so a signed URL is the only way
> in, and enrollment is re-checked server-side each time.

## Attempt timing model (canonical)

Let `open = scheduled_at` and `due = scheduled_at + duration_minutes` (the
**on-time deadline** — only used to flag lateness). There is **no time-based hard
lock**: once a test opens it stays startable indefinitely. The only thing that
locks a test is the **teacher closing it** (`quizzes.status = 'closed'`).

| Now / quiz status | Student can start? | Flag |
|---|---|---|
| `now < open` | No — locked, show countdown | — |
| `now ≥ open`, status `published` | Yes | on-time if submitted by `due`, else `is_late = true` |
| status `closed`, no attempt | No | `missed` |

- A student who misses the scheduled time can still take the test at any later time
  while it is published; their attempt is simply flagged `is_late` (submitted after
  `due`). "Missed" now means the teacher **closed** the test before the student
  attempted it — not that a time window elapsed.
- One attempt only — enforced by the unique constraint **and** re-checked server-side.
- Timer = `duration_minutes` from the real `started_at` (each student gets their full
  duration no matter how late they start); auto-submit at zero. All timing validated
  server-side; the client clock is untrusted. Closing a test blocks **new** starts;
  an already in-progress attempt still runs its full duration to completion.
- The shared timing helper is `utils/test.ts`: `computePhase(timing, now, status)`
  returns `closed` only when the quiz status is `closed`, `upcoming` before `open`,
  otherwise `open`. `personalDeadline(startedAt, durationMinutes) = startedAt +
  duration`. `LATE_GRACE_MINUTES` (`utils/constants.ts`) no longer gates anything; it
  survives only as the informational `closesAt = due + grace` marker in reporting JSON.

## Row-Level Security (RLS)

Enabled on all six tables by `20260915140000_enable_rls.sql`. It backs the API
(defense-in-depth) — the Route Handlers still enforce the business rules, but a
raw browser query can no longer bypass them.

| Table | `authenticated` (browser JWT) can… |
|---|---|
| `profiles` | SELECT own row; teacher SELECTs all. No client writes. |
| `batches` | teacher: full CRUD; student: SELECT enrolled batches only. `secret_pass` revoked from `anon`. |
| `student_batches` | student SELECTs own enrollments; teacher SELECTs all. Writes via service role (registration **and** the admin enroll/remove UI, `/api/batches/[id]/students`). |
| `quizzes` | teacher: full CRUD; student: SELECT published, **non-archived** tests in enrolled batches. |
| `questions` | teacher: full CRUD; student: SELECT body of takeable questions. **`correct_answer`/`explanation` column-REVOKEd from everyone but service role.** |
| `quiz_attempts` | student/teacher SELECT (own / all). **No client writes** — inserts & updates go through the service role. |
| `study_materials` | teacher: full CRUD. student: SELECT non-archived rows in enrolled batches only. The **file bytes** are in a private storage bucket reached only via server-minted signed URLs (service role), so RLS on this table protects the *metadata* and the download route re-checks enrollment before signing. |

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

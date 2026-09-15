# DISCOVERY.md

> Inventory of the existing codebase, produced before any code changes.
> Date: 2026-09-15.

## 1. Detected tech stack

| Concern | Actual in repo | Spec expectation | Match? |
|---|---|---|---|
| Framework | **Next.js 16.3.5** (App Router), React 19.2.8, TypeScript 5 | (unspecified) | — |
| Styling | **Tailwind CSS v4** + custom CSS vars + `lucide-react` icons + `next-themes` | **Ant Design (antd)** for all UI | ❌ **conflict** — antd is NOT installed |
| Backend | Next.js **Route Handlers** (`app/api/**`) | REST-ish | ✅ |
| DB | **Supabase (Postgres)** via `@supabase/ssr` + `@supabase/supabase-js` | any DB | ✅ |
| Auth | **Supabase Auth** (cookie sessions), gated in `middleware.ts` | reuse existing | ✅ |
| AI | **Google Gemini** (`@google/generative-ai`) in `app/api/generate/route.ts` | multimodal AI, key server-side | ✅ (with bugs, see §5) |
| Tests | none | testable features required | ❌ missing |

Notes: `deno.lock` is present but the project is npm-based (`package-lock.json`); `node_modules` is **not installed**.

## 2. Roles model (important divergence)

- DB enum is `user_role = ('student', 'teacher')`. The spec uses **`admin`** / `student`.
- **In this codebase, `teacher` == the spec's `admin`.** Admin screens live under `/admin/*`; `middleware.ts` allows admin routes only when role is `teacher`.
- Teacher login is special-cased in `app/api/auth/login/route.ts` via `TEACHER_EMAIL` / `TEACHER_PASSWORD` env vars (auto-provisions the teacher account on first login).

## 3. Existing routes / pages and their state

| Route | File | State |
|---|---|---|
| `/` (public landing) | `app/(protected)/page.tsx` | ⚠️ Done but sits **inside** the `(protected)` group with `TopNav`; picks student/teacher |
| `/login` | `app/login/page.tsx` | ✅ Done (role toggle student/teacher) |
| `/signup` | `app/signup/page.tsx` | ✅ Done (student self-register w/ batch + secret key) |
| `/admin` | `app/(protected)/admin/page.tsx` | ❌ **Stub** — renders literal text "admin page" |
| `/admin` (alt) | `app/(protected)/teacher/page.tsx` | ⚠️ Rich dashboard but **100% MOCK data**, not wired |
| `/admin/batches` | `app/(protected)/admin/batches/page.tsx` | ✅ List (Tailwind table) wired to API; links to `/admin/batches/[id]/edit` which **does not exist** |
| `/admin/batches/new` | `app/(protected)/admin/batches/new/page.tsx` | ✅ Create form, wired |
| `/admin/batches/[id]/edit` | — | ❌ **Missing** (linked from list) |
| `/admin/quizzes`, `/admin/students`, `/admin/settings` | — | ❌ **Missing** (linked in `Header.tsx`) |
| `/student` | `app/(protected)/student/page.tsx` | ✅ Dashboard — tests by phase + attempt state (§3.5) |
| `/student/tests/[id]` | `app/(protected)/student/tests/[id]/page.tsx` | ✅ Take-test flow — timer/auto-submit/single-attempt/review (§3.5) |
| `/home` | `app/home/page.tsx` | ⚠️ **Partial** AI quiz builder: upload image → Gemini → keep/discard → save. No Steps wizard, no schedule/batch/level/marks, saves direct from browser client |
| `/admin/new.tsx` | `app/(protected)/admin/new.tsx` | ❌ Empty file (not a route) |
| Public leaderboard | — | ❌ **Missing** |

## 4. Data models (in `supabase/migrations/`)

- `profiles(id→auth.users, role, full_name, created_at)`
- `batches(id, name, course text, teacher_id, secret_pass unique, created_at)`
- `student_batches(student_id, batch_id)` — m2m junction ✅
- `quizzes(id, title, created_at, batch_id, teacher_id, is_published)`
- `questions(id, quiz_id, question_text, options jsonb, correct_answer, created_at)`
- `quiz_attempts(id, quiz_id, student_id, score, max_score, created_at)`

**Migration bug:** `20260913094724_create_quizzes_tables.sql` is missing the leading
`CREATE TABLE quizzes (` — the file starts at `quizzes (`, so it will not apply.

**Schema gaps vs spec §4:**
- `quizzes` has **no** `scheduled_at`, `duration_minutes`, `exam_level`, `total_questions`, `marks_per_question`, `negative_marking`, `passing_marks`, `status` (draft/published/closed).
- `questions` stores `options` as a plain string array + `correct_answer` string; spec wants `options: [{key,text}]`, `correctOptionKey`, `explanation`, `difficulty`, `order`. No `sourceImageRef`.
- `quiz_attempts` has **no** `started_at`, `submitted_at`, `is_late`, `status` (in_progress/submitted/missed), `answers`, `correct_count`, and **no unique(quiz_id, student_id)** — so single-attempt cannot be enforced.
- **No RLS policies** in migrations; access control lives only in API handlers (and some are unguarded — see §6).

## 5. AI integration status

- Provider: **Gemini**, key from `GEMINI_API_KEY` (server-side ✅, never sent to client ✅).
- Endpoint: `POST /api/generate` accepts `image` + `prompt` (multipart). ⚠️ Does **not** accept `count`, `examLevel`, or a separate `extraPrompt` as structured params (all folded into one `prompt`).
- Model string is **`gemini-3.8-flash`** — almost certainly invalid; needs a real model id (e.g. `gemini-2.0-flash`), verify against current API.
- Output shape returned: `{question_text, options: string[], correct_answer}` — **differs** from spec JSON (`text`, `options:[{key,text}]`, `correctOptionKey`, `explanation`, `difficulty`).
- Parsing strips ```json fences ✅ but has **no defensive validation** (malformed items / wrong option count / missing answer will throw and 500).
- No auth/role check on the endpoint.

## 6. Security / correctness observations

- `GET /api/batches` has **no auth**; `POST/PUT/DELETE /api/batches/:id` check *a* user but **not** the `teacher` role → any signed-in student could create/edit/delete batches.
- `DELETE /api/batches/:id` **hard-deletes** (spec §2 wants archive/soft-delete to preserve results).
- `logout/route.ts` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` while everything else uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — inconsistent env var.
- `signup` references `batch.courses?.name` but the batches API returns `course` (text) — dead reference.
- `/home` saves quizzes straight from the **browser** Supabase client (bypasses server enforcement) and never sets `batch_id`, `is_published`, schedule, or marks.
- No `.env` present; required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `TEACHER_EMAIL`, `TEACHER_PASSWORD`, `REGISTRATION_SECRET_PASS`.

## 7. Gap list — spec §3 feature → current status

| Spec feature | Status | Work needed |
|---|---|---|
| 3.1 Auth & roles | 🟡 Partial | Works; harden batch/generate API role checks; reconcile `teacher`==`admin` |
| 3.2 Batch management | 🟡 Partial | Have list+create+API; missing **edit page**, batch **detail** (students+tests), enroll/remove UI, student/test **counts**, **archive** instead of hard-delete |
| 3.3 AI test-creation wizard | 🔴 Mostly missing | Have a basic generator; need **Steps** wizard (setup→generate→review→publish), schedule/duration/level/marks, approve counter `X/Y`, repeatable rounds, publish→DB with batch+schedule |
| 3.4 View all students | 🔴 Missing | Students list + search/filter + detail with late/missed flags |
| 3.5 Student take-test | ✅ Done | Window lock, single attempt, timer + auto-submit, autosave, `is_late`, server scoring, graded review (see DECISIONS D10) |
| 3.6 Late/missed reporting | 🔴 Missing | Per-test results table (started/submitted/on-time/late/missed) |
| 3.7 Public leaderboard | 🔴 Missing | Public route, ranking metric, public-safe fields only |
| 5 AI structured output | 🟡 Partial | Fix model id, add count/level/extraPrompt, defensive validation, spec JSON shape |
| DB schema for above | ✅ Done | `quizzes` scheduling/marks + `quiz_attempts` lifecycle fields + `UNIQUE(quiz_id,student_id)` (migration `20260915120000`); score widened to NUMERIC (`20260915130000`) |
| Ant Design UI | 🔴 Not started | antd not installed; all UI is Tailwind (see decision needed) |
| DECISIONS.md / tests / seed | 🔴 Missing | Create |

## 8. Biggest open decision

The spec mandates **Ant Design for all new UI** (§0.3), but the existing app is built
**entirely in Tailwind v4 + custom components + lucide-react** — and the same spec (§0.2)
says *reuse existing patterns, don't introduce parallel patterns*. These two rules
collide. Introducing antd alongside Tailwind v4 (with React 19 / Next 16) means two
styling systems and real integration friction. This needs an explicit call before the
UI-heavy features are built — see the question raised to the maintainer.

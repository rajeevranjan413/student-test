# Architecture

> Source-of-truth overview of the Coaching Center app. Read this + `DATA-MODEL.md`
> + the relevant entry in `FEATURES.md` **before** writing code. Update these docs
> **first** when a feature or contract changes (doc-first workflow — see `AGENTS.md`).

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 (existing pages) + **Ant Design v5** (new admin screens) |
| Icons | `lucide-react` (Tailwind pages), `@ant-design/icons` (antd pages) |
| Theming | `next-themes` (class strategy); antd algorithm synced via `AntdProvider` |
| Auth + DB | Supabase (Postgres) via `@supabase/ssr` (cookie sessions) |
| Files | Supabase **Storage** (private `study-material` bucket) for shared PDFs; accessed server-side via the service role + short-lived signed URLs (F13) |
| AI | Google Gemini via `@google/generative-ai` (server-side only) |
| PWA | `app/manifest.ts` (`/manifest.webmanifest`) + `public/sw.js` service worker → installable Android app (F11). SW never caches `/api/*`, `/auth`, or cross-origin, so data/sessions stay live. |

## 2. Layers & data flow

```
Browser (React / antd / Tailwind)
  │  fetch() same-origin, cookies attached
  ▼
Next.js Route Handlers (app/api/**)   ← auth + validation + business rules live HERE
  │  @supabase/ssr server client (user-scoped)  |  service-role client (admin ops)
  ▼
Supabase Postgres  ← schema in supabase/migrations/**
  ▲
Gemini (multimodal)  ← only from /api/generate, key never leaves the server
```

**Golden rule:** every security-critical rule (role checks, test window, single
attempt, answer secrecy, scoring) is enforced **server-side** in a Route Handler.
The client is never trusted.

**Two Supabase clients (know which you're holding):**
- **User-scoped** (`@supabase/ssr`, anon key + the request's cookies) — used by
  `requireUser`/`requireTeacher`/`requireStudent` and most reads. Runs as the
  logged-in user and is **subject to RLS** — i.e. it has exactly the power the
  browser would, so it can never be the thing that keeps a secret from that user.
- **Service-role** (`utils/supabase/admin.ts`, secret key) — **bypasses RLS** and
  column grants. Server-only, and only after the caller is authorized. It is the
  sole reader of answer columns and the sole writer of `quiz_attempts`.

**RLS layer:** RLS is enabled on every table (`supabase/migrations/**`), backing
the API as defense-in-depth. `questions.correct_answer`/`explanation` are
column-REVOKEd from the browser JWT, and `quiz_attempts` has no client write
policy. Full policy map in `DATA-MODEL.md → Row-Level Security`.

## 3. Auth & roles

- Roles enum: `('student' | 'teacher')`. **`teacher` == the spec's `admin`.**
- Session: Supabase cookies. `middleware.ts` gates `/admin/*` (teacher only) and
  `/student/*` (any authed user), and bounces authed users away from `/login`/`/signup`
  **and the `/` landing page** to their home page (teacher → `/admin`, student → `/student`).
- Server guards: `utils/auth.ts` → `getSupabaseServer()`, `getAuthedUser()`,
  `requireUser()`, `requireTeacher()`, `requireStudent()` (throw `AuthError`
  carrying an HTTP status).
- The single teacher account is bootstrapped from `TEACHER_EMAIL`/`TEACHER_PASSWORD`
  on first login (`app/api/auth/login`). Students self-register by selecting **one or
  more** batches and entering the per-batch `secret_pass` for **any one** of them
  (`app/api/auth/register`, service-role); a matching code enrolls them in **all**
  selected batches. `REGISTRATION_SECRET_PASS` is an **optional global master
  override** only, not the primary gate. See `DECISIONS.md D18`, `D23`.

## 4. Route map

### Pages
| Route | Group | Role | State |
|---|---|---|---|
| `/` | — public coaching-center home page (hero, stats, features, programs, gallery, CTA, footer; Student/Teacher sign-in kept as small buttons; authed users redirected to their home) | public-ish | done (Tailwind) |
| `/login` (chooser), `/login/student`, `/login/teacher`, `/signup` | — | public | done (Tailwind) |
| `/admin` | `(protected)` | teacher | done (antd) — live dashboard (counts + recent) |
| `/admin/batches`, `/admin/batches/new` | `(protected)` | teacher | done (Tailwind) — list w/ counts |
| `/admin/batches/[id]` | `(protected)` | teacher | done (antd) — detail: students + tests + enroll |
| `/admin/batches/[id]/edit` | `(protected)` | teacher | done (antd) — edit form |
| `/admin/quizzes`, `/admin/quizzes/new` | `(protected)` | teacher | done (antd) — AI + manual wizard |
| `/admin/quizzes/[id]` | `(protected)` | teacher | done (antd) — test results / late-missed report |
| `/admin/quizzes/[id]/edit` | `(protected)` | teacher | done (antd) — edit settings + questions (F3) |
| `/admin/students`, `/admin/students/[id]` | `(protected)` | teacher | done (antd) — roster + student detail |
| `/student` | `(protected)` | student | done (antd) — **home** hub: banner slider + section cards (F12) |
| `/student/tests` | `(protected)` | student | done (antd) — test list; `/student/tests/[id]` take/resume/result (F6) |
| `/admin/study-material` | `(protected)` | teacher | done (antd) — upload/list/delete PDF notes per batch (F13) |
| `/student/study-material` | `(protected)` | student | done (antd) — view/download notes for enrolled batches (F13) |
| `/teacher` | `(protected)` | teacher | retired mock → redirects to `/admin` |
| `/home` | — | teacher | legacy AI builder (superseded by wizard) |
| `/leaderboard` | — | public | done (antd) — ranked, batch filter |

### API (all under `app/api/`)
| Endpoint | Method | Guard | Purpose |
|---|---|---|---|
| `/auth/login`, `/auth/logout`, `/auth/register` | POST | mixed | session lifecycle |
| `/batches` | GET, POST | teacher | list active (+ student/test counts) / create |
| `/batches/[id]` | GET, PUT, DELETE | teacher | detail (batch + students + available + tests) / update / **archive** |
| `/batches/[id]/students` | POST, DELETE | teacher | enroll / remove a student (service role; batch-owner checked) |
| `/public/batches` | GET | none | signup dropdown, public-safe fields only |
| `/public/leaderboard` | GET | none | ranked students (service role); optional `?batch=` |
| `/generate` | POST | teacher | image(s)+params → validated MCQs (Gemini) |
| `/tests` | GET, POST | teacher | list teacher's live (non-archived) tests / create test + questions |
| `/tests/[id]` | GET, PUT, DELETE | teacher | full test + questions (answers via service role) / update settings + questions / **delete or archive** |
| `/tests/[id]/results` | GET | teacher | per-enrolled-student late/missed report + roll-up |
| `/students` | GET | teacher | roster: profile + contact + batches + activity |
| `/students/[id]` | GET | teacher | student detail: profile + batches + test history |
| `/student/batches` | GET | student | the student's enrolled batches (powers the header batch switcher) |
| `/student/tests` | GET | student | dashboard: enrolled tests + phase + attempt state |
| `/student/tests/[id]` | GET, PATCH | student | take-page bootstrap + answer autosave |
| `/student/tests/[id]/start` | POST | student | start (idempotent resume) an attempt |
| `/student/tests/[id]/submit` | POST | student | submit + server-side scoring |
| `/study-materials` | GET, POST | teacher | list own materials (opt. `?batch=`) / upload a PDF (multipart) + insert row |
| `/study-materials/[id]` | DELETE | teacher | delete a material (removes the storage object + row; ownership-checked) |
| `/study-materials/[id]/download` | GET | teacher **or** enrolled student | authorize, then return a short-lived signed URL (`?mode=view\|download`) |
| `/student/study-materials` | GET | student | materials for the student's enrolled batches (opt. `?batch=`) |

**Planned (see `FEATURES.md`):** — (all F1–F13 shipped; seed data + live verification remain).

## 5. AI generation contract (`/api/generate`)

- Input: `multipart/form-data` — `images` (one or more; legacy `image` accepted),
  `count`, `extraPrompt` (legacy `prompt` accepted).
- Model: `gemini-2.0-flash` (override with `GEMINI_MODEL`).
- Output: `{ questions: [{ text, options:[{key,text}]×4, correctOptionKey,
  explanation, difficulty }] }`. Server parses defensively (strips fences,
  validates 4 options + valid key), **drops malformed items**, returns 502 on
  unreadable/empty so the UI can retry. The key never leaves the server.

## 6. Conventions (do / don't)

- **Do** put auth + validation in the Route Handler; **don't** trust the client.
- **Do** build new admin UI with antd; keep existing Tailwind pages as-is (no mass
  rewrite). Don't mix the two systems inside one screen.
- **Do** style Tailwind pages via the **design tokens** in `app/globals.css`
  (`bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`,
  `border-border`, `bg-primary`/`text-primary-foreground`, `ring-ring`). The token
  values (light+dark) are the single source of truth for colour; antd's brand colour
  in `AntdProvider` mirrors the same `--primary`. Don't hardcode hex/`gray-*` for
  themeable surfaces, and don't reference a token class without a matching
  `@theme` mapping (it silently no-ops).
- **Do** wrap antd admin/student pages in `components/layout/PageContainer` for a
  consistent max-width + mobile-first gutter, and give antd `Table`s
  `scroll={{ x: "max-content" }}` so they scroll (not overflow) on phones.
- **Do** keep the top nav role-aware: `components/layout/Header.tsx` derives its
  links from the current path (admin vs student vs minimal on `/`); the server still
  enforces access in `middleware.ts`.
- **Do** keep migrations additive & idempotent (`IF NOT EXISTS` / `DO` blocks);
  never rename/drop columns other code reads. Version the API JSON only on an
  unavoidable breaking change.
- **Do** soft-delete (archive) anything with results/history.
- **Never** log or commit secrets; read all keys from env (`.env.example` lists them).
- **Verify** every change with `npx tsc --noEmit`, `npx eslint <changed files>`,
  and `npx next build`. (No `.env` in-repo → live e2e needs your own keys.)

## 7. Key files

```
utils/auth.ts            server auth guards (requireTeacher / requireUser)
utils/constants.ts       EXAM_LEVELS, LATE_GRACE_MINUTES, difficulty colors
utils/supabase/*         browser / server / middleware clients (user-scoped, RLS)
utils/supabase/admin.ts  service-role client (server-only, bypasses RLS)
utils/test.ts            pure timing/scoring + deriveOutcome (shared by reporting)
utils/students.ts        server-only email/phone lookup from auth.users (teacher)
components/providers/    ThemeProvider (next-themes), AntdProvider (antd SSR+theme)
components/layout/       Header (role-aware top nav), PageContainer (shared shell), ThemeToggle
app/globals.css          design tokens (light+dark) → Tailwind @theme mappings
middleware.ts            route gating by role
supabase/migrations/*    schema (source of truth for DB)
docs/DATA-MODEL.md       full schema reference
docs/FEATURES.md         per-feature spec + status
```

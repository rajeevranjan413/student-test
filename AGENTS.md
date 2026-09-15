# Coaching Center App — Agent Operating Manual

You are **completing** (not rebuilding) a web app for a competitive-exam coaching
center: admins organize students into batches, generate AI tests from photos of
notes, schedule them, and publish a public leaderboard. This manual is loaded every
session — follow it.

## 0. Doc-first workflow (do this every session)
1. **Read before writing:** `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, and the
   relevant entry in `docs/FEATURES.md`. Also `DISCOVERY.md` (repo inventory) and
   `DECISIONS.md` (why things are the way they are).
2. **Docs change first:** to add or change a feature, update its `docs/FEATURES.md`
   entry (and `ARCHITECTURE.md` / `DATA-MODEL.md` if a contract or the schema
   moves) **before** touching code. Keep specs and code in sync in the same change.
3. **Plan → implement → verify** in small, working increments. The app must build
   at the end of every session.

## 1. Where things live
| Need | Look at |
|---|---|
| System overview, routes, API surface, conventions | `docs/ARCHITECTURE.md` |
| Schema, enums, timing model | `docs/DATA-MODEL.md` (mirrors `supabase/migrations/**`) |
| Per-feature spec + status + code map | `docs/FEATURES.md` |
| Repo inventory / gap list | `DISCOVERY.md` |
| Design decisions + rationale | `DECISIONS.md` |
| Required env vars | `.env.example` |

## 2. Non-negotiable rules
- **Server enforces everything security-critical:** role checks, test window,
  single attempt, answer secrecy, scoring — all in Route Handlers (`app/api/**`).
  Never trust the client. Guards: `utils/auth.ts`.
- **Role `teacher` == admin.** Admin routes/APIs require `requireTeacher`.
- **Correct answers never reach a student mid-attempt.** Filter `correct_answer` out.
- **UI:** new admin screens use **Ant Design**; existing Tailwind pages stay as-is
  (no mass rewrite; don't mix systems within one screen).
- **Migrations** are additive & idempotent (`IF NOT EXISTS` / `DO` blocks); never
  rename/drop columns other code reads. API JSON changes stay additive.
- **Soft-delete (archive)** anything with results/history.
- **Never** log or commit secrets; read all keys from env.

## 3. Definition of done (every change)
- [ ] Relevant `docs/*` updated (doc-first).
- [ ] `npx tsc --noEmit` clean · `npx eslint <changed files>` clean · `npx next build` passes.
- [ ] Feature's acceptance criteria in `docs/FEATURES.md` ticked.
- [ ] No secrets committed; no dead buttons or stubbed shipped paths.

> Note: there is no `.env` in the repo, so a live click-through needs your own
> Supabase + Gemini keys (`.env.example`). Otherwise verify via typecheck/lint/build.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

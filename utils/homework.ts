// Shared constants + types for Homework (F14). Framework-agnostic so both the
// Route Handlers and the antd pages import from one place. File-homework uploads
// reuse the same accepted-mime rules as Study Material (PDF or common image).

import { ACCEPTED_MIMES, ACCEPT_ATTR, MAX_FILE_BYTES } from "./studyMaterial";

export { ACCEPTED_MIMES, ACCEPT_ATTR, MAX_FILE_BYTES };

/** The storage bucket that holds `file` homework bytes (private; see migration). */
export const HOMEWORK_BUCKET = "homework";

/** The two homework kinds. */
export type HomeworkType = "mcq" | "file";

/** Publish state. Students only ever see `published`, non-archived homework. */
export type HomeworkStatus = "draft" | "published";

/** A homework row as returned by the admin list API (no storage internals). */
export type HomeworkListItem = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  type: HomeworkType;
  title: string;
  description: string | null;
  due_at: string | null;
  total_questions: number | null;
  question_count: number;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: HomeworkStatus;
  is_published: boolean;
  created_at: string;
};

/** A homework row as seen by a student, plus their own completion/attempt state. */
export type StudentHomeworkItem = {
  id: string;
  batch_id: string;
  batch_name: string | null;
  type: HomeworkType;
  title: string;
  description: string | null;
  due_at: string | null;
  question_count: number;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  // The student's own attempt (null until they submit / mark done).
  attempt: {
    status: "submitted" | "done";
    score: number | null;
    max_score: number | null;
    correct_count: number | null;
    submitted_at: string;
  } | null;
};

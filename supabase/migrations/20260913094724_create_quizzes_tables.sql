create table quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);



create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade not null,
  question_text text not null,
  options jsonb not null,
  correct_answer text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

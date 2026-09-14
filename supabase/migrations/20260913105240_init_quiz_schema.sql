-- 1. Create Enums for Roles
CREATE TYPE user_role AS ENUM ('student', 'teacher');

-- 2. Profiles Table (Extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Batches Table
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  course TEXT NOT NULL, -- Changed from course_id foreign key to a direct text field
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  secret_pass TEXT UNIQUE NOT NULL, 
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Student-Batch Junction Table
CREATE TABLE student_batches (
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, batch_id)
);

-- 5. Alter your existing Quizzes Table
ALTER TABLE quizzes
  ADD COLUMN batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  ADD COLUMN teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN is_published BOOLEAN DEFAULT false;

-- 6. Quiz Attempts Table (For the Ranking System)
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
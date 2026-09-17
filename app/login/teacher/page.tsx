import { LoginForm } from "../_components/LoginForm";

export default function TeacherLoginPage() {
  return (
    <LoginForm
      role="teacher"
      title="Teacher Login"
      subtitle="Sign in to manage batches and tests"
    />
  );
}

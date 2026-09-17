import { LoginForm } from "../_components/LoginForm";

export default function StudentLoginPage() {
  return (
    <LoginForm
      role="student"
      title="Student Login"
      subtitle="Sign in to take your tests"
      showRegister
    />
  );
}

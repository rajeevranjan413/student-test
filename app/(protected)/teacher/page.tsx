import { redirect } from "next/navigation";

// The old hardcoded-mock teacher overview is retired; the real dashboard lives at
// /admin (F9). The landing page's "Teacher" role card still points here, so we keep
// the route and redirect. Unauthed visitors are bounced to /login by middleware.
export default function TeacherPage() {
  redirect("/admin");
}

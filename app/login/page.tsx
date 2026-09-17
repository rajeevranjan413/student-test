import Link from "next/link";
import { GraduationCap, Presentation, ArrowLeft, ChevronRight } from "lucide-react";

/**
 * Login chooser. The old single page with an in-form student/teacher toggle is
 * gone — each role now has its own dedicated sign-in page (`/login/student`,
 * `/login/teacher`). This screen just routes the user to the right one.
 */
export default function LoginChooserPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-[#09090b] transition-colors duration-300">
      <div className="w-full max-w-md bg-background rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
        <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Welcome Back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Choose how you want to sign in</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login/student"
            className="group flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <span className="h-11 w-11 shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <GraduationCap className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">Student</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Take tests and view your rank</span>
            </span>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
          </Link>

          <Link
            href="/login/teacher"
            className="group flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <span className="h-11 w-11 shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Presentation className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">Teacher</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Manage batches, tests and students</span>
            </span>
            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}

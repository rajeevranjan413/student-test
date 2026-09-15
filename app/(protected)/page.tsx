import Link from "next/link";
import { GraduationCap, Presentation, Trophy } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-[#09090b]">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Welcome to NeerajCompetitiveClasses
        </h1>
        <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
          Select your role to continue to the platform
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-3xl w-full">
        {/* Teacher Selection Card */}
        <Link 
          href="/teacher" 
          className="group relative rounded-2xl border border-gray-200 dark:border-gray-800 bg-background p-8 shadow-sm hover:border-primary dark:hover:border-primary hover:shadow-md transition-all duration-200 flex flex-col items-center text-center"
        >
          <div className="mb-4 rounded-full bg-primary/10 p-5 text-primary group-hover:scale-110 transition-transform duration-200">
            <Presentation className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Teacher</h2>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Manage your courses, students, upload materials, and view schedules.
          </p>
        </Link>

        {/* Student Selection Card */}
        <Link 
          href="/student" 
          className="group relative rounded-2xl border border-gray-200 dark:border-gray-800 bg-background p-8 shadow-sm hover:border-primary dark:hover:border-primary hover:shadow-md transition-all duration-200 flex flex-col items-center text-center"
        >
          <div className="mb-4 rounded-full bg-primary/10 p-5 text-primary group-hover:scale-110 transition-transform duration-200">
            <GraduationCap className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Student</h2>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Access your enrolled classes, view assignments, and track your progress.
          </p>
        </Link>
      </div>

      <Link
        href="/leaderboard"
        className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <Trophy className="h-4 w-4" /> View public leaderboard
      </Link>
    </main>
  );
}
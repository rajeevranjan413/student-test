"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Presentation, Mail, Lock, Loader2, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to login");
      }

      // Redirect by the user's ACTUAL role (from the server), falling back to the
      // toggle only if the server didn't return one.
      const destination = data.role === "teacher" ? "/admin" : "/student";
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-[#09090b] transition-colors duration-300">
      <div className="w-full max-w-md bg-background rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
        <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Welcome Back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Sign in to your account</p>
        </div>

        {/* Role Toggle */}
        <div className="flex p-1 mb-8 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <button
            type="button"
            onClick={() => setRole("student")}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${
              role === "student"
                ? "bg-white dark:bg-[#18181b] text-foreground shadow-sm"
                : "text-gray-500 hover:text-foreground"
            }`}
          >
            <GraduationCap className="h-4 w-4 mr-2" />
            Student
          </button>
          <button
            type="button"
            onClick={() => setRole("teacher")}
            className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${
              role === "teacher"
                ? "bg-white dark:bg-[#18181b] text-foreground shadow-sm"
                : "text-gray-500 hover:text-foreground"
            }`}
          >
            <Presentation className="h-4 w-4 mr-2" />
            Teacher
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center py-2.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
          </button>
        </form>

        {role === "student" && (
          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Register here
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
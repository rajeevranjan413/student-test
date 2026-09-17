"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Mail, Lock, User, Key, Loader2, ArrowLeft, BookOpen } from "lucide-react";
import { formatBatchTiming } from "@/utils/batch";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretPass, setSecretPass] = useState("");
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string; start_time?: string | null; end_time?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingBatches, setFetchingBatches] = useState(true);
  const [error, setError] = useState("");

  // Fetch available batches when the page loads
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await fetch("/api/public/batches");
        if (res.ok) {
          const data = await res.json();
          setBatches(data);
          if (data.length > 0) setBatchIds([data[0].id]); // Pre-select first batch
        }
      } catch (err) {
        console.error("Failed to fetch batches", err);
      } finally {
        setFetchingBatches(false);
      }
    };
    fetchBatches();
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (batchIds.length === 0) {
      setError("Please select at least one batch.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          secretPass,
          batchIds, // Send all selected batches to the API
          role: "student",
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Registration failed");

      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-[#09090b] transition-colors duration-300">
      <div className="w-full max-w-md bg-background rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
        <Link href="/login" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Login
        </Link>

        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Student Registration</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Create your account and select your batches</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground" placeholder="John Doe" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground" placeholder="student@example.com" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground" placeholder="Create a password" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Select Batches</label>
            <div className="rounded-lg border border-gray-300 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-800 max-h-52 overflow-y-auto">
              {fetchingBatches ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                  <BookOpen className="h-4 w-4" /> Loading batches…
                </p>
              ) : batches.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                  <BookOpen className="h-4 w-4" /> No batches available
                </p>
              ) : (
                batches.map((batch) => {
                  const checked = batchIds.includes(batch.id);
                  const timing = formatBatchTiming(batch.start_time, batch.end_time);
                  return (
                    <label
                      key={batch.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setBatchIds((prev) =>
                            e.target.checked
                              ? [...prev, batch.id]
                              : prev.filter((id) => id !== batch.id)
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-foreground">
                        {batch.name}
                        {timing && <span className="text-gray-500 dark:text-gray-400"> ({timing})</span>}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Pick every batch you attend. You only need the enrollment code for one of them.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Batch Enrollment Code</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="password" required value={secretPass} onChange={(e) => setSecretPass(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground" placeholder="Enrollment code for any one selected batch" />
            </div>
          </div>

          <button type="submit" disabled={loading || batchIds.length === 0} className="w-full flex items-center justify-center py-2.5 px-4 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors disabled:opacity-70">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
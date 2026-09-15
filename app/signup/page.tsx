"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Mail, Lock, User, Key, Loader2, ArrowLeft, BookOpen } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretPass, setSecretPass] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
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
          if (data.length > 0) setBatchId(data[0].id); // Auto-select first batch
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

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          secretPass,
          batchId, // Send the selected batch to the API
          role: "student",
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Registration failed");

      router.push("/login");
    } catch (err: any) {
      setError(err.message);
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Create your account and select a batch</p>
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
            <label className="block text-sm font-medium text-foreground mb-1.5">Select Batch</label>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                required
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                disabled={fetchingBatches || batches.length === 0}
                className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground appearance-none disabled:opacity-50"
              >
                {fetchingBatches ? (
                  <option value="">Loading batches...</option>
                ) : batches.length === 0 ? (
                  <option value="">No batches available</option>
                ) : (
                  batches.map((batch) => (
                    <option key={batch.id} value={batch.id} className="bg-background text-foreground">
                      {batch.name} {batch.course ? `(${batch.course})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Platform Secret Key</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="password" required value={secretPass} onChange={(e) => setSecretPass(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary text-foreground" placeholder="Provided by your teacher" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full flex items-center justify-center py-2.5 px-4 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors disabled:opacity-70">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
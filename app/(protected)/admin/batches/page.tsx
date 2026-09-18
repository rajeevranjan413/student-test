"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Edit, Loader2, BookOpen } from "lucide-react";
import { formatBatchTiming } from "@/utils/batch";

type Batch = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  secret_pass: string;
  student_count?: number;
  test_count?: number;
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatches = async () => {
    try {
      const res = await fetch("/api/batches");
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const deleteBatch = async (id: string) => {
    if (!confirm("Are you sure you want to delete this batch? All associated students will be affected.")) return;
    
    try {
      const res = await fetch(`/api/batches/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBatches(batches.filter(b => b.id !== id));
      } else {
        alert("Failed to delete batch");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/30">
            <BookOpen className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Manage Batches</h1>
            <p className="text-sm text-muted-foreground mt-0.5">View, edit, and organize your student batches</p>
          </div>
        </div>
        <Link href="/admin/batches/new" className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-sm shadow-primary/30 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/40">
          <Plus className="h-5 w-5 mr-2" /> Create Batch
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-card">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </span>
          <h3 className="text-lg font-semibold text-foreground">No batches found</h3>
          <p className="text-muted-foreground mb-6 mt-1">You haven&apos;t created any batches yet.</p>
          <Link href="/admin/batches/new" className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-sm">
            <Plus className="h-5 w-5 mr-2" /> Create your first batch
          </Link>
        </div>
      ) : (
        <>
        {/* Mobile: stacked cards (the table would force horizontal scrolling). */}
        <div className="grid gap-3 md:hidden">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/batches/${batch.id}`} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
                  {batch.name}
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={`/admin/batches/${batch.id}/edit`} className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-primary/10">
                    <Edit className="h-5 w-5" />
                  </Link>
                  <button onClick={() => deleteBatch(batch.id)} className="p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{formatBatchTiming(batch.start_time, batch.end_time) ?? "—"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-foreground">
                  {batch.secret_pass}
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{batch.student_count ?? 0} students</span>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{batch.test_count ?? 0} tests</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: full table. */}
        <div className="hidden rounded-2xl border border-border overflow-hidden bg-card shadow-sm md:block">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch Name</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timing</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Secret Pass Code</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Students</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Tests</th>
                <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold">
                    <Link href={`/admin/batches/${batch.id}`} className="text-foreground hover:text-primary transition-colors">
                      {batch.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{formatBatchTiming(batch.start_time, batch.end_time) ?? "—"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-foreground">
                      {batch.secret_pass}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">{batch.student_count ?? 0}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground">{batch.test_count ?? 0}</span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link href={`/admin/batches/${batch.id}/edit`} className="inline-block p-2 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-primary/10">
                      <Edit className="h-5 w-5" />
                    </Link>
                    <button onClick={() => deleteBatch(batch.id)} className="p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
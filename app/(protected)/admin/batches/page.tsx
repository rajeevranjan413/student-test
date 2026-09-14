"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Edit, Loader2, BookOpen } from "lucide-react";

export default function BatchesPage() {
  const [batches, setBatches] = useState<any[]>([]);
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
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage Batches</h1>
          <p className="text-sm text-muted-foreground mt-1">View, edit, and organize your student batches</p>
        </div>
        <Link href="/admin/batches/new" className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="h-5 w-5 mr-2" /> Create Batch
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : batches.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-border">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">No batches found</h3>
          <p className="text-muted-foreground mb-4">You haven't created any batches yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-background">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Batch Name</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Course Name</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Secret Pass Code</th>
                <th className="px-6 py-4 text-sm font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{batch.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{batch.course}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                      {batch.secret_pass}
                    </span>
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
      )}
    </div>
  );
}
"use client";
import { 
  Copy, 
  Users, 
  Layers, 
  FileText,
  CheckCircle2,
  XCircle,
  MoreVertical
} from 'lucide-react';

const MOCK_BATCHES = [
  { id: 'b1', name: 'CS301: Advanced Data Structures', course: 'Computer Science', secret_pass: 'DSA-9042', students: 45, created_at: 'Oct 1, 2023' },
  { id: 'b2', name: 'AI420: Neural Networks', course: 'Artificial Intelligence', secret_pass: 'AI-7721', students: 32, created_at: 'Oct 5, 2023' },
  { id: 'b3', name: 'WEB240: Full Stack Architecture', course: 'Web Development', secret_pass: 'WEB-3389', students: 59, created_at: 'Oct 10, 2023' },
];

const MOCK_QUIZZES = [
  { id: 'q1', title: 'Binary Search Trees & AVL', batch_name: 'CS301', is_published: true, created_at: 'Oct 12, 2023' },
  { id: 'q2', title: 'Backpropagation Fundamentals', batch_name: 'AI420', is_published: true, created_at: 'Oct 14, 2023' },
  { id: 'q3', title: 'RESTful API Security', batch_name: 'WEB240', is_published: false, created_at: 'Oct 15, 2023' },
];

export default function AdminHomePage() {
  const handleCopy = (text:any) => {
    navigator.clipboard.writeText(text);
    // In a real app, you'd use a toast notification here
    alert(`Copied ${text} to clipboard!`); 
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Overview
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Manage your batches, monitor quiz attempts, and track student progress.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-zinc-900/50 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
            <Layers className="w-4 h-4" />
            <span className="text-sm font-medium">Total Batches</span>
          </div>
          <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
            {MOCK_BATCHES.length}
          </div>
        </div>
        
        <div className="p-5 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-zinc-900/50 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">Enrolled Students</span>
          </div>
          <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
            136
          </div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-zinc-900/50 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">Active Quizzes</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
              {MOCK_QUIZZES.filter(q => q.is_published).length}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              / {MOCK_QUIZZES.length} total
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Batches List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">Recent Batches</h2>
            <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">View all</button>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-sm">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {MOCK_BATCHES.map((batch) => (
                <li key={batch.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{batch.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{batch.course} • {batch.students} students</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {batch.secret_pass}
                    </span>
                    <button 
                      onClick={() => handleCopy(batch.secret_pass)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Quizzes List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">Recent Quizzes</h2>
            <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium">View all</button>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-sm">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {MOCK_QUIZZES.map((quiz) => (
                <li key={quiz.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{quiz.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-zinc-500">Batch: {quiz.batch_name}</p>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <p className="text-xs text-zinc-500">{quiz.created_at}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {quiz.is_published ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                        <CheckCircle2 className="w-3 h-3" /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        <XCircle className="w-3 h-3" /> Draft
                      </span>
                    )}
                    <button className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};


"use client";

export function TimelineSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {/* Timeline dot + line */}
          <div className="relative flex flex-col items-center">
            <div className="z-10 mt-1.5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-slate-200 ring-4 ring-[color:var(--surface-muted)] dark:bg-slate-700" />
            <div className="w-px flex-1 bg-[color:var(--border)]" />
          </div>
          {/* Card skeleton */}
          <div className="mb-4 flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="flex gap-2">
                  <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

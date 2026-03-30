"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Shield, X } from "lucide-react";
import { formatRelativeTimestamp } from "@/lib/formatters";

interface ApprovalItem {
  approval_id: string;
  board_id: string;
  board_name?: string | null;
  task_title?: string | null;
  confidence?: number | null;
  created_at: string;
}

interface PendingApprovalsSectionProps {
  items: ApprovalItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
}

function ApprovalsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--surface-muted)]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--surface-muted)]" />
        </div>
      ))}
    </div>
  );
}

export function PendingApprovalsSection({
  items,
  total,
  isLoading,
  isError,
}: PendingApprovalsSectionProps) {
  const hasItems = items.length > 0;

  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-strong">Pending Approvals</h3>
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-strong"
        >
          View All Approvals
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <ApprovalsSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
          Pending approvals are temporarily unavailable.
        </div>
      ) : hasItems ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.approval_id}
              className="rounded-lg border-b border-[color:var(--border)] px-1 py-2.5 last:border-b-0"
            >
              <div className="flex items-start gap-2">
                <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-strong">
                    {item.task_title ?? "Pending approval"}
                  </p>
                  <p className="text-xs text-muted">
                    {item.board_name ?? "Board"} &middot; {formatRelativeTimestamp(item.created_at)}
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <Link
                      href={`/boards/${item.board_id}/approvals`}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Link>
                    <Link
                      href={`/boards/${item.board_id}/approvals`}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {total > items.length && (
            <p className="pt-1 text-xs text-muted">
              Showing {items.length} of {total} pending approvals.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 py-8 text-center dark:border-emerald-700 dark:bg-emerald-500/10">
          <Check className="mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            No pending approvals
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            All caught up — nice work!
          </p>
        </div>
      )}
    </section>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useCallback, useMemo } from "react";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@/auth/clerk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Shield,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import type { ApiError } from "@/api/mutator";
import {
  listApprovalsApiV1BoardsBoardIdApprovalsGet,
  updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch,
} from "@/api/generated/approvals/approvals";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import type { ApprovalRead, BoardRead } from "@/api/generated/model";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type GlobalApprovalsData = {
  approvals: ApprovalRead[];
  warnings: string[];
};

const humanizeAction = (value: string) =>
  value
    .split(".")
    .map((part) =>
      part.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    )
    .join(" · ");

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
};

function ApprovalsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GlobalApprovalsInner() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      retry: false,
    },
    request: { cache: "no-store" },
  });

  const boards = useMemo(() => {
    if (boardsQuery.data?.status !== 200) return [];
    return boardsQuery.data.data.items ?? [];
  }, [boardsQuery.data]);

  const boardLabelById = useMemo(() => {
    const entries = boards.map((board: BoardRead) => [board.id, board.name]);
    return Object.fromEntries(entries) as Record<string, string>;
  }, [boards]);

  const boardIdsKey = useMemo(() => {
    const ids = boards.map((board) => board.id);
    ids.sort();
    return ids.join(",");
  }, [boards]);

  const approvalsKey = useMemo(
    () => ["approvals", "global", boardIdsKey] as const,
    [boardIdsKey],
  );

  const approvalsQuery = useQuery<GlobalApprovalsData, ApiError>({
    queryKey: approvalsKey,
    enabled: Boolean(isSignedIn && boards.length > 0),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      const results = await Promise.allSettled(
        boards.map(async (board) => {
          const response = await listApprovalsApiV1BoardsBoardIdApprovalsGet(
            board.id,
            { limit: 200 },
            { cache: "no-store" },
          );
          if (response.status !== 200) {
            throw new Error(
              `Failed to load approvals for ${board.name} (status ${response.status}).`,
            );
          }
          return { boardId: board.id, approvals: response.data.items ?? [] };
        }),
      );

      const approvals: ApprovalRead[] = [];
      const warnings: string[] = [];

      for (const result of results) {
        if (result.status === "fulfilled") {
          approvals.push(...result.value.approvals);
        } else {
          warnings.push(result.reason?.message ?? "Unable to load approvals.");
        }
      }

      return { approvals, warnings };
    },
  });

  const updateApprovalMutation = useMutation<
    Awaited<
      ReturnType<
        typeof updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch
      >
    >,
    ApiError,
    { boardId: string; approvalId: string; status: "approved" | "rejected" }
  >({
    mutationFn: ({ boardId, approvalId, status }) =>
      updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch(
        boardId,
        approvalId,
        { status },
        { cache: "no-store" },
      ),
  });

  const approvals = useMemo(
    () => approvalsQuery.data?.approvals ?? [],
    [approvalsQuery.data],
  );
  const warnings = useMemo(
    () => approvalsQuery.data?.warnings ?? [],
    [approvalsQuery.data],
  );
  const errorText = approvalsQuery.error?.message ?? null;

  const handleDecision = useCallback(
    (approvalId: string, status: "approved" | "rejected") => {
      const approval = approvals.find((item) => item.id === approvalId);
      const boardId = approval?.board_id;
      if (!boardId) return;

      updateApprovalMutation.mutate(
        { boardId, approvalId, status },
        {
          onSuccess: (result) => {
            if (result.status !== 200) return;
            queryClient.setQueryData<GlobalApprovalsData>(
              approvalsKey,
              (prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  approvals: prev.approvals.map((item) =>
                    item.id === approvalId ? result.data : item,
                  ),
                };
              },
            );
          },
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: approvalsKey });
          },
        },
      );
    },
    [approvals, approvalsKey, queryClient, updateApprovalMutation],
  );

  const combinedError = useMemo(() => {
    const parts: string[] = [];
    if (errorText) parts.push(errorText);
    if (warnings.length > 0) parts.push(warnings.join(" "));
    return parts.length > 0 ? parts.join(" ") : null;
  }, [errorText, warnings]);

  const isLoading = boardsQuery.isLoading || approvalsQuery.isLoading;

  // Sort: pending first, then by date desc
  const sortedApprovals = useMemo(() => {
    return [...approvals].sort((a, b) => {
      const aIsPending = (a.status ?? "pending") === "pending" ? 0 : 1;
      const bIsPending = (b.status ?? "pending") === "pending" ? 0 : 1;
      if (aIsPending !== bIsPending) return aIsPending - bIsPending;
      const aTime = new Date(a.created_at).getTime() || 0;
      const bTime = new Date(b.created_at).getTime() || 0;
      return bTime - aTime;
    });
  }, [approvals]);

  const pendingCount = useMemo(
    () =>
      approvals.filter((a) => (a.status ?? "pending") === "pending").length,
    [approvals],
  );

  return (
    <main className="flex-1 overflow-y-auto bg-app">
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted" />
              <h1 className="text-2xl font-semibold tracking-tight text-strong">
                Pending Approvals
              </h1>
            </div>
            <p className="text-sm text-muted">
              Review and manage approval requests across all boards
            </p>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                  Pending
                </p>
                <p className="text-lg font-bold text-strong tabular-nums">
                  {pendingCount}
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                  Total
                </p>
                <p className="text-lg font-bold text-strong tabular-nums">
                  {approvals.length}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error banner */}
        {combinedError ? (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
            {combinedError}
            <button
              type="button"
              onClick={() => approvalsQuery.refetch()}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Content */}
        <div className="mt-6">
          {isLoading ? (
            <ApprovalsSkeleton />
          ) : sortedApprovals.length === 0 ? (
            /* Empty state */
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] p-12 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="mt-4 text-base font-semibold text-strong">
                No pending approvals — all caught up!
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                New approval requests will appear here as soon as they arrive.
                Check back later.
              </p>
            </div>
          ) : (
            /* Approval cards grid */
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedApprovals.map((approval) => {
                const status = approval.status ?? "pending";
                const isPending = status === "pending";
                const isApproved = status === "approved";
                const isRejected = status === "rejected";
                const boardName =
                  boardLabelById[approval.board_id] ?? "Unknown board";
                const actionLabel = humanizeAction(approval.action_type);
                const isUpdating =
                  updateApprovalMutation.isPending &&
                  updateApprovalMutation.variables?.approvalId === approval.id;

                return (
                  <div
                    key={approval.id}
                    className={cn(
                      "group rounded-xl border bg-[color:var(--surface)] p-5 shadow-sm transition-all",
                      isPending
                        ? "border-amber-200 dark:border-amber-800/50"
                        : "border-[color:var(--border)]",
                      isPending && "hover:shadow-md",
                      !isPending && "opacity-75",
                    )}
                  >
                    {/* Card header: action + status */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        {actionLabel}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <StatusDot
                          status={status}
                          variant="approval"
                          className="h-2 w-2"
                        />
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-[0.15em]",
                            isPending && "text-amber-600 dark:text-amber-400",
                            isApproved &&
                              "text-emerald-600 dark:text-emerald-400",
                            isRejected && "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {status}
                        </span>
                      </div>
                    </div>

                    {/* Board name */}
                    <p className="mt-2 text-sm font-semibold text-strong">
                      {boardName}
                    </p>

                    {/* Confidence score */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded bg-[color:var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-strong tabular-nums">
                        {approval.confidence ?? 0}% confidence
                      </span>
                    </div>

                    {/* Timestamp */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5 opacity-60" />
                      <span>{formatTimestamp(approval.created_at)}</span>
                      <span className="text-quiet">
                        · {formatRelativeTime(approval.created_at)}
                      </span>
                    </div>

                    {/* Action buttons */}
                    {isPending && (
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleDecision(approval.id, "approved")
                          }
                          disabled={isUpdating}
                          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleDecision(approval.id, "rejected")
                          }
                          disabled={isUpdating}
                          className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        >
                          <ShieldX className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {/* Resolved status */}
                    {!isPending && (
                      <div className="mt-4 flex items-center gap-1.5 text-xs">
                        {isApproved ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              Approved
                            </span>
                          </>
                        ) : (
                          <>
                            <ShieldX className="h-3.5 w-3.5 text-rose-500" />
                            <span className="font-medium text-rose-600 dark:text-rose-400">
                              Rejected
                            </span>
                          </>
                        )}
                        {approval.resolved_at && (
                          <span className="text-muted">
                            · {formatTimestamp(approval.resolved_at)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function GlobalApprovalsPage() {
  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view approvals.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/approvals"
            signUpForceRedirectUrl="/approvals"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <GlobalApprovalsInner />
      </SignedIn>
    </DashboardShell>
  );
}

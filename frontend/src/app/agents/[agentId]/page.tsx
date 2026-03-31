"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity,
  Bot,
  Clock,
  Cpu,
  LayoutGrid,
  MessageSquare,
  Settings,
  Trash2,
  Pencil,
  ArrowLeft,
} from "lucide-react";

import { ApiError } from "@/api/mutator";
import {
  type getAgentApiV1AgentsAgentIdGetResponse,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useGetAgentApiV1AgentsAgentIdGet,
} from "@/api/generated/agents/agents";
import {
  type listActivityApiV1ActivityGetResponse,
  useListActivityApiV1ActivityGet,
} from "@/api/generated/activity/activity";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  formatRelativeTimestamp as formatRelative,
  formatTimestamp,
} from "@/lib/formatters";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type {
  ActivityEventRead,
  AgentRead,
  BoardRead,
} from "@/api/generated/model";
import { Markdown } from "@/components/atoms/Markdown";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function AgentDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-16 rounded-xl" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const params = useParams();
  const agentIdParam = params?.agentId;
  const agentId = Array.isArray(agentIdParam) ? agentIdParam[0] : agentIdParam;

  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const agentQuery = useGetAgentApiV1AgentsAgentIdGet<
    getAgentApiV1AgentsAgentIdGetResponse,
    ApiError
  >(agentId ?? "", {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && agentId),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      retry: false,
    },
  });

  const activityQuery = useListActivityApiV1ActivityGet<
    listActivityApiV1ActivityGetResponse,
    ApiError
  >(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn && isAdmin),
        refetchInterval: 30_000,
        retry: false,
      },
    },
  );

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 60_000,
      refetchOnMount: "always",
      retry: false,
    },
  });

  const agent: AgentRead | null =
    agentQuery.data?.status === 200 ? agentQuery.data.data : null;
  const events = useMemo<ActivityEventRead[]>(() => {
    if (activityQuery.data?.status !== 200) return [];
    return activityQuery.data.data.items ?? [];
  }, [activityQuery.data]);
  const boards = useMemo<BoardRead[]>(() => {
    if (boardsQuery.data?.status !== 200) return [];
    return boardsQuery.data.data.items ?? [];
  }, [boardsQuery.data]);

  const agentEvents = useMemo(() => {
    if (!agent) return [];
    return events
      .filter((event) => event.agent_id === agent.id)
      .slice(0, 10);
  }, [events, agent]);
  const linkedBoard =
    !agent?.board_id || agent?.is_gateway_main
      ? null
      : (boards.find((board) => board.id === agent.board_id) ?? null);

  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<ApiError>({
    mutation: {
      onSuccess: () => {
        setDeleteOpen(false);
        router.push("/agents");
      },
      onError: (err) => {
        setDeleteError(err.message || "Something went wrong.");
      },
    },
  });

  const isLoading =
    agentQuery.isLoading || activityQuery.isLoading || boardsQuery.isLoading;
  const error =
    agentQuery.error?.message ??
    activityQuery.error?.message ??
    boardsQuery.error?.message ??
    null;

  const isDeleting = deleteMutation.isPending;
  const agentStatus = agent?.status ?? "unknown";

  const handleDelete = () => {
    if (!agentId || !isSignedIn) return;
    setDeleteError(null);
    deleteMutation.mutate({ agentId });
  };

  // Extract identity profile info
  const identityProfile = agent?.identity_profile as
    | Record<string, unknown>
    | null
    | undefined;
  const agentRole =
    agent?.is_board_lead
      ? "Lead"
      : agent?.is_gateway_main
        ? "Gateway"
        : "Worker";
  const agentEmoji =
    typeof identityProfile?.emoji === "string"
      ? identityProfile.emoji
      : "🤖";
  const agentDescription =
    typeof identityProfile?.description === "string"
      ? identityProfile.description
      : typeof identityProfile?.role === "string"
        ? identityProfile.role
        : null;
  const agentSkills = Array.isArray(identityProfile?.skills)
    ? (identityProfile.skills as string[])
    : [];

  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view agents.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/agents"
            signUpForceRedirectUrl="/agents"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        {!isAdmin ? (
          <main className="flex-1 overflow-y-auto bg-app">
            <div className="p-4 md:p-8">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-5 text-sm text-muted">
                Only organization owners and admins can access agents.
              </div>
            </div>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto bg-app">
            <div className="p-4 md:p-8">
              {/* Error banner */}
              {error ? (
                <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                  {error}
                  <button
                    type="button"
                    onClick={() => agentQuery.refetch()}
                    className="ml-2 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {isLoading ? (
                <AgentDetailSkeleton />
              ) : !agent ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] p-12 text-center shadow-sm">
                  <Bot className="h-12 w-12 text-muted opacity-40" />
                  <p className="mt-4 text-base font-semibold text-strong">
                    Agent not found
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    This agent may have been removed or the ID is invalid.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push("/agents")}
                  >
                    Back to agents
                  </Button>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-quiet">
                        Agents
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl" role="img" aria-label="agent avatar">
                          {agentEmoji}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-strong">
                              {agent.name}
                            </h1>
                            <StatusDot status={agentStatus} variant="agent" />
                            <Badge
                              variant={
                                agentStatus === "online"
                                  ? "success"
                                  : agentStatus === "busy" ||
                                      agentStatus === "provisioning"
                                    ? "warning"
                                    : "outline"
                              }
                            >
                              {agentStatus}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted">
                            {agentRole} agent
                            {agentDescription ? ` · ${agentDescription}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/agents")}
                        className="gap-1.5"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back
                      </Button>
                      <Link
                        href={`/agents/${agent.id}/edit`}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] px-3 text-sm font-semibold text-muted transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteOpen(true)}
                        className="gap-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Skill tags */}
                  {agentSkills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agentSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-[color:var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-[color:var(--accent-strong)]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* KPI Stats Row */}
                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted opacity-60" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                          Last seen
                        </p>
                      </div>
                      <p className="mt-2 text-lg font-bold text-strong">
                        {formatRelative(agent.last_seen_at)}
                      </p>
                      <p className="text-xs text-quiet">
                        {formatTimestamp(agent.last_seen_at)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted opacity-60" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                          Status
                        </p>
                      </div>
                      <p className="mt-2 text-lg font-bold text-strong capitalize">
                        {agentStatus}
                      </p>
                      <p className="text-xs text-quiet">
                        {agent.openclaw_session_id ? "Session bound" : "Unbound"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted opacity-60" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                          Events
                        </p>
                      </div>
                      <p className="mt-2 text-lg font-bold text-strong tabular-nums">
                        {agentEvents.length}
                      </p>
                      <p className="text-xs text-quiet">recent activity</p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-muted opacity-60" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                          Board
                        </p>
                      </div>
                      <p className="mt-2 text-sm font-bold text-strong truncate">
                        {agent.is_gateway_main
                          ? "Gateway main"
                          : linkedBoard
                            ? linkedBoard.name
                            : "—"}
                      </p>
                      <p className="text-xs text-quiet">{agentRole}</p>
                    </div>
                  </div>

                  {/* Main content grid */}
                  <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    {/* Left column */}
                    <div className="space-y-6">
                      {/* Overview card */}
                      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted" />
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                            Configuration
                          </p>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Agent ID
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted break-all">
                              {agent.id}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Session key
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted break-all">
                              {agent.openclaw_session_id ?? "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Board
                            </p>
                            {agent.is_gateway_main ? (
                              <p className="mt-1 text-sm text-strong">
                                Gateway main (no board)
                              </p>
                            ) : linkedBoard ? (
                              <Link
                                href={`/boards/${linkedBoard.id}`}
                                className="mt-1 inline-flex text-sm font-medium text-[color:var(--accent)] transition hover:underline"
                              >
                                {linkedBoard.name}
                              </Link>
                            ) : (
                              <p className="mt-1 text-sm text-strong">—</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Role
                            </p>
                            <p className="mt-1 text-sm text-strong">
                              {agentRole}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Updated
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {formatTimestamp(agent.updated_at)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-quiet">
                              Created
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {formatTimestamp(agent.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Health card */}
                      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-muted" />
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                              Health
                            </p>
                          </div>
                          <Badge
                            variant={
                              agentStatus === "online"
                                ? "success"
                                : agentStatus === "busy" ||
                                    agentStatus === "provisioning"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {agentStatus}
                          </Badge>
                        </div>
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between rounded-lg bg-[color:var(--surface-muted)] px-3 py-2 text-sm">
                            <span className="text-muted">
                              Heartbeat window
                            </span>
                            <span className="font-medium text-strong">
                              {formatRelative(agent.last_seen_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-[color:var(--surface-muted)] px-3 py-2 text-sm">
                            <span className="text-muted">
                              Session binding
                            </span>
                            <span className="font-medium text-strong">
                              {agent.openclaw_session_id ? "Bound" : "Unbound"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg bg-[color:var(--surface-muted)] px-3 py-2 text-sm">
                            <span className="text-muted">
                              Connection status
                            </span>
                            <div className="flex items-center gap-1.5">
                              <StatusDot
                                status={agentStatus}
                                variant="agent"
                                className="h-2 w-2"
                              />
                              <span className="font-medium text-strong capitalize">
                                {agentStatus}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right column — Activity timeline */}
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted" />
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-quiet">
                            Recent Activity
                          </p>
                        </div>
                        <span className="rounded-full bg-[color:var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
                          {agentEvents.length} events
                        </span>
                      </div>

                      {agentEvents.length === 0 ? (
                        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6 text-center">
                          <Activity className="h-8 w-8 text-muted opacity-30" />
                          <p className="mt-3 text-sm font-medium text-strong">
                            No activity yet
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Events will appear here as the agent works.
                          </p>
                        </div>
                      ) : (
                        <div className="relative space-y-0">
                          {/* Timeline line */}
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[color:var(--border)]" />

                          {agentEvents.map((event, idx) => (
                            <div
                              key={event.id}
                              className="relative flex gap-3 py-3"
                            >
                              {/* Timeline dot */}
                              <div className="relative z-10 mt-1.5 flex-shrink-0">
                                <div className="h-[14px] w-[14px] rounded-full border-2 border-[color:var(--border)] bg-[color:var(--surface)]" />
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1">
                                {event.message?.trim() ? (
                                  <div className="select-text cursor-text text-sm leading-relaxed text-strong break-words">
                                    <Markdown
                                      content={event.message}
                                      variant="comment"
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium text-strong">
                                    {event.event_type
                                      .replace(/_/g, " ")
                                      .replace(/\./g, " · ")
                                      .replace(/\b\w/g, (c) =>
                                        c.toUpperCase(),
                                      )}
                                  </p>
                                )}
                                <p className="mt-1 text-[11px] text-quiet">
                                  {formatTimestamp(event.created_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>
        )}
      </SignedIn>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent aria-label="Delete agent">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will remove {agent?.name}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
              {deleteError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

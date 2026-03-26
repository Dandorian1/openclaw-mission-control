"use client";

export const dynamic = "force-dynamic";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listActivityApiV1ActivityGetResponse,
  useListActivityApiV1ActivityGet,
} from "@/api/generated/activity/activity";
import type { AgentRead, BoardRead } from "@/api/generated/model";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import {
  Building2,
  Briefcase,
  Users,
  Play,
  MessageCircle,
  Wifi,
  WifiOff,
  Clock,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentActivity(agent: AgentRead): "active" | "idle" | "offline" {
  if (agent.status === "online") return "active";
  if (!agent.last_seen_at) return "offline";
  const diff = Date.now() - new Date(agent.last_seen_at).getTime();
  if (diff < 5 * 60_000) return "active";
  if (diff < 30 * 60_000) return "idle";
  return "offline";
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-gray-400",
};

const DESK_COLORS = [
  "from-blue-500/10 to-blue-600/5",
  "from-purple-500/10 to-purple-600/5",
  "from-teal-500/10 to-teal-600/5",
  "from-rose-500/10 to-rose-600/5",
  "from-amber-500/10 to-amber-600/5",
  "from-indigo-500/10 to-indigo-600/5",
  "from-emerald-500/10 to-emerald-600/5",
  "from-cyan-500/10 to-cyan-600/5",
];

const AGENT_EMOJIS = ["💻", "🖥️", "⌨️", "🔧", "🛡️", "🎨", "📊", "🔬", "📱", "🤖"];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Single agent desk on the office floor */
const AgentDesk = memo(function AgentDesk({
  agent,
  index,
  isGathered,
}: {
  agent: AgentRead;
  index: number;
  isGathered: boolean;
}) {
  const activity = agentActivity(agent);
  const emoji = AGENT_EMOJIS[index % AGENT_EMOJIS.length];
  const color = DESK_COLORS[index % DESK_COLORS.length];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all duration-500",
        "border-[color:var(--border)] bg-gradient-to-b",
        color,
        isGathered && "scale-90",
      )}
      title={`${agent.name} — ${activity}`}
    >
      {/* Desk emoji */}
      <span className="text-2xl">{emoji}</span>

      {/* Name pill */}
      <span className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        agent.is_board_lead
          ? "bg-indigo-600 text-white"
          : "bg-[color:var(--surface-strong)] text-strong",
      )}>
        {agent.name}
      </span>

      {/* Status dot */}
      <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[activity])} />
    </div>
  );
});

/** Meeting table in center of office */
const MeetingTable = memo(function MeetingTable() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] px-8 py-4">
      <span className="text-lg">📋</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        Meeting Table
      </span>
    </div>
  );
});

/** Live activity feed panel */
const ActivityFeed = memo(function ActivityFeed({
  events,
  isLoading,
}: {
  events: Array<{ id: string; event_type: string; message: string; created_at: string; agent_id?: string | null }>;
  isLoading: boolean;
}) {
  const dotColor = (type: string) => {
    if (type.includes("comment")) return "bg-blue-500";
    if (type.includes("done") || type.includes("complete")) return "bg-emerald-500";
    if (type.includes("error")) return "bg-rose-500";
    return "bg-gray-400";
  };

  return (
    <div className="flex h-full flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <Activity className="h-3.5 w-3.5" />
          Live Activity
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto" aria-live="polite">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-[color:var(--surface-strong)]" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <Activity className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-xs">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--border)]">
            {events.slice(0, 20).map((event) => (
              <div key={event.id} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dotColor(event.event_type))} />
                  <div className="min-w-0">
                    <p className="text-xs text-strong line-clamp-2">{event.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{timeAgo(event.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OfficePage() {
  const { isSignedIn } = useAuth();
  const [isGathered, setIsGathered] = useState(false);
  const [allWorking, setAllWorking] = useState(false);

  const agentsQuery = useListAgentsApiV1AgentsGet<listAgentsApiV1AgentsGetResponse>(
    undefined,
    { query: { enabled: Boolean(isSignedIn), refetchInterval: 15_000 } },
  );

  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse>(
    undefined,
    { query: { enabled: Boolean(isSignedIn) } },
  );

  const activityQuery = useListActivityApiV1ActivityGet<listActivityApiV1ActivityGetResponse>(
    { limit: 20 },
    { query: { enabled: Boolean(isSignedIn), refetchInterval: 15_000 } },
  );

  const agents: AgentRead[] = useMemo(() => {
    const data = agentsQuery.data?.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "items" in data) return (data as { items: AgentRead[] }).items;
    return [];
  }, [agentsQuery.data]);

  const boards: BoardRead[] = useMemo(() => {
    const data = boardsQuery.data?.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "items" in data) return (data as { items: BoardRead[] }).items;
    return [];
  }, [boardsQuery.data]);

  const boardMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of boards) m.set(b.id, b.name);
    return m;
  }, [boards]);

  const activityEvents = useMemo(() => {
    const data = activityQuery.data?.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && "items" in data) return (data as { items: Array<{ id: string; event_type: string; message: string; created_at: string }> }).items;
    return [];
  }, [activityQuery.data]);

  // Group agents by board
  const agentsByBoard = useMemo(() => {
    const groups = new Map<string, AgentRead[]>();
    for (const agent of agents) {
      const key = agent.board_id ?? "unassigned";
      const list = groups.get(key) ?? [];
      list.push(agent);
      groups.set(key, list);
    }
    return groups;
  }, [agents]);

  const handleGather = useCallback(() => {
    setIsGathered(true);
    setAllWorking(false);
    setTimeout(() => setIsGathered(false), 3000);
  }, []);

  const handleAllWorking = useCallback(() => {
    setAllWorking(true);
    setIsGathered(false);
  }, []);

  const activeCount = agents.filter((a) => agentActivity(a) === "active").length;
  const idleCount = agents.filter((a) => agentActivity(a) === "idle").length;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view the virtual office.",
        forceRedirectUrl: "/office",
      }}
      title={
        <span className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          Virtual Office
        </span>
      }
      description={`${agents.length} agents · ${activeCount} active · ${idleCount} idle`}
    >
      <div className="flex h-[calc(100vh-4rem)] flex-col">

        {/* Main area */}
        <div className="flex flex-1 min-h-0">
          {/* Office floor */}
          <div className="flex-1 overflow-auto p-6">
            {/* Checkered floor */}
            <div
              className="relative min-h-[500px] rounded-xl border border-[color:var(--border)] p-8"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, var(--surface-muted) 25%, transparent 25%), linear-gradient(-45deg, var(--surface-muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--surface-muted) 75%), linear-gradient(-45deg, transparent 75%, var(--surface-muted) 75%)",
                backgroundSize: "40px 40px",
                backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
              }}
            >
              {/* Board zones */}
              {Array.from(agentsByBoard.entries()).map(([boardId, boardAgents], groupIdx) => (
                <div key={boardId} className="mb-8">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded bg-[color:var(--surface)] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted border border-[color:var(--border)]">
                      {boardMap.get(boardId) ?? "Unassigned"}
                    </span>
                  </div>

                  <div className={cn(
                    "flex flex-wrap gap-4 transition-all duration-500",
                    isGathered && "justify-center gap-2",
                  )}>
                    {boardAgents.map((agent, i) => (
                      <AgentDesk
                        key={agent.id}
                        agent={agent}
                        index={groupIdx * 10 + i}
                        isGathered={isGathered}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Meeting table (center) */}
              {agents.length > 0 && (
                <div className="flex justify-center py-4">
                  <MeetingTable />
                </div>
              )}

              {/* Empty state */}
              {agents.length === 0 && !agentsQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted">
                  <Building2 className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-lg font-medium">Office is empty</p>
                  <p className="text-sm">Add agents to populate the virtual workspace.</p>
                </div>
              )}

              {/* Loading */}
              {agentsQuery.isLoading && (
                <div className="flex flex-wrap justify-center gap-4 py-12">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 w-20 animate-pulse rounded-lg bg-[color:var(--surface-strong)]" />
                  ))}
                </div>
              )}
            </div>

            {/* Demo controls */}
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5">
              <button
                onClick={handleAllWorking}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition",
                  allWorking
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)]",
                )}
              >
                <Briefcase className="h-3.5 w-3.5" />
                All Working
              </button>
              <button
                onClick={handleGather}
                className="flex items-center gap-2 rounded-md bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-strong transition hover:bg-[color:var(--surface-strong)]"
              >
                <Users className="h-3.5 w-3.5" />
                Gather
              </button>
              <button
                onClick={handleGather}
                className="flex items-center gap-2 rounded-md bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-strong transition hover:bg-[color:var(--surface-strong)]"
              >
                <Play className="h-3.5 w-3.5" />
                Run Meeting
              </button>
              <button
                className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Start Chat
              </button>
            </div>
          </div>

          {/* Activity feed sidebar */}
          <div className="hidden w-72 shrink-0 lg:block">
            <ActivityFeed events={activityEvents} isLoading={activityQuery.isLoading} />
          </div>
        </div>

        {/* Agent status bar */}
        <div className="shrink-0 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
            {agents.map((agent) => {
              const activity = agentActivity(agent);
              return (
                <div
                  key={agent.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-strong hover:bg-[color:var(--surface-muted)] transition cursor-pointer"
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[activity])} />
                  {agent.name}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}

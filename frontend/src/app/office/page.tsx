"use client";

export const dynamic = "force-dynamic";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/clerk";
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
  Pause,
  MessageCircle,
  Activity,
  GripVertical,
  X,
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
// Agent Desk (draggable)
// ---------------------------------------------------------------------------

const AgentDesk = memo(function AgentDesk({
  agent,
  index,
  atTable,
  onRemoveFromTable,
}: {
  agent: AgentRead;
  index: number;
  atTable?: boolean;
  onRemoveFromTable?: () => void;
}) {
  const activity = agentActivity(agent);
  const emoji = AGENT_EMOJIS[index % AGENT_EMOJIS.length];
  const color = DESK_COLORS[index % DESK_COLORS.length];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", agent.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all duration-500 cursor-grab active:cursor-grabbing",
        "border-[color:var(--border)] bg-gradient-to-b",
        color,
        atTable && "ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-gray-900",
      )}
      title={`${agent.name} — ${activity} (drag to meeting table)`}
    >
      {/* Drag grip */}
      <GripVertical className="absolute top-1 right-1 h-3 w-3 text-muted opacity-40" />

      {/* Remove from table button */}
      {atTable && onRemoveFromTable && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemoveFromTable(); }}
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition"
          title="Send back to desk"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

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

// ---------------------------------------------------------------------------
// Meeting Table (drop target)
// ---------------------------------------------------------------------------

function MeetingTable({
  attendees,
  agents,
  onDrop,
  onRemove,
  isMeeting,
}: {
  attendees: Set<string>;
  agents: AgentRead[];
  onDrop: (agentId: string) => void;
  onRemove: (agentId: string) => void;
  isMeeting: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const tableAgents = agents.filter((a) => attendees.has(a.id));

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const agentId = e.dataTransfer.getData("text/plain");
        if (agentId) onDrop(agentId);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 transition-all duration-300 min-h-[120px]",
        dragOver
          ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 scale-[1.02]"
          : "border-[color:var(--border)] bg-[color:var(--surface-muted)]",
        isMeeting && "border-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{isMeeting ? "🗣️" : "📋"}</span>
        <span className={cn(
          "text-[10px] font-semibold uppercase tracking-widest",
          isMeeting ? "text-emerald-600 dark:text-emerald-400" : "text-muted",
        )}>
          {isMeeting
            ? `Meeting in progress (${tableAgents.length})`
            : tableAgents.length > 0
              ? `Meeting Table (${tableAgents.length})`
              : "Drop agents here to start a meeting"
          }
        </span>
      </div>

      {/* Attendees around the table */}
      {tableAgents.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {tableAgents.map((agent, i) => (
            <AgentDesk
              key={agent.id}
              agent={agent}
              index={i}
              atTable
              onRemoveFromTable={() => onRemove(agent.id)}
            />
          ))}
        </div>
      )}

      {/* Meeting pulse */}
      {isMeeting && tableAgents.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Agents are collaborating...
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

const ActivityFeed = memo(function ActivityFeed({
  events,
  isLoading,
}: {
  events: Array<{ id: string; event_type: string; message: string; created_at: string }>;
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
// Chat Panel (slide-out)
// ---------------------------------------------------------------------------

function ChatPanel({ onClose, agents }: { onClose: () => void; agents: AgentRead[] }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ from: string; text: string; time: string }>>([
    { from: "System", text: "Office chat started. Messages are visible to all agents in the room.", time: new Date().toLocaleTimeString() },
  ]);

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages((prev) => [...prev, { from: "You", text: message, time: new Date().toLocaleTimeString() }]);
    setMessage("");
  };

  return (
    <div className="flex h-full flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <MessageCircle className="h-3.5 w-3.5" />
          Office Chat
        </h3>
        <button onClick={onClose} className="text-muted hover:text-strong transition">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className="rounded-lg bg-[color:var(--surface-muted)] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-strong">{msg.from}</span>
              <span className="text-[9px] text-muted">{msg.time}</span>
            </div>
            <p className="text-xs text-strong mt-0.5">{msg.text}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-[color:var(--border)] p-3">
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs text-strong placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button onClick={handleSend} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OfficePage() {
  const { isSignedIn } = useAuth();

  // State for interactive features
  const [tableAttendees, setTableAttendees] = useState<Set<string>>(new Set());
  const [isMeeting, setIsMeeting] = useState(false);
  const [allWorking, setAllWorking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  // Group agents by board — only show those NOT at the table
  const agentsByBoard = useMemo(() => {
    const groups = new Map<string, AgentRead[]>();
    for (const agent of agents) {
      if (tableAttendees.has(agent.id)) continue; // at meeting table
      const key = agent.board_id ?? "unassigned";
      const list = groups.get(key) ?? [];
      list.push(agent);
      groups.set(key, list);
    }
    return groups;
  }, [agents, tableAttendees]);

  // --- Button handlers ---

  const handleDropOnTable = useCallback((agentId: string) => {
    setTableAttendees((prev) => new Set(prev).add(agentId));
    setAllWorking(false);
  }, []);

  const handleRemoveFromTable = useCallback((agentId: string) => {
    setTableAttendees((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      if (next.size === 0) setIsMeeting(false);
      return next;
    });
  }, []);

  const handleGather = useCallback(() => {
    // Gather ALL agents to the meeting table
    setTableAttendees(new Set(agents.map((a) => a.id)));
    setAllWorking(false);
  }, [agents]);

  const handleAllWorking = useCallback(() => {
    // Send everyone back to their desks
    setTableAttendees(new Set());
    setIsMeeting(false);
    setAllWorking(true);
  }, []);

  const handleRunMeeting = useCallback(() => {
    if (tableAttendees.size === 0) {
      // If no one at table, gather everyone first
      setTableAttendees(new Set(agents.map((a) => a.id)));
    }
    setIsMeeting(true);
    setAllWorking(false);
  }, [agents, tableAttendees.size]);

  const handleEndMeeting = useCallback(() => {
    setIsMeeting(false);
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
              {/* Board zones (agents at their desks) */}
              {Array.from(agentsByBoard.entries()).map(([boardId, boardAgents], groupIdx) => (
                <div key={boardId} className="mb-8">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded bg-[color:var(--surface)] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted border border-[color:var(--border)]">
                      {boardMap.get(boardId) ?? "Unassigned"}
                    </span>
                    <span className="text-[10px] text-muted">
                      {boardAgents.length} agent{boardAgents.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className={cn(
                    "flex flex-wrap gap-4 transition-all duration-500",
                    allWorking && "gap-3",
                  )}>
                    {boardAgents.map((agent, i) => (
                      <AgentDesk
                        key={agent.id}
                        agent={agent}
                        index={groupIdx * 10 + i}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Meeting table (drop target) */}
              {agents.length > 0 && (
                <div className="flex justify-center py-4">
                  <MeetingTable
                    attendees={tableAttendees}
                    agents={agents}
                    onDrop={handleDropOnTable}
                    onRemove={handleRemoveFromTable}
                    isMeeting={isMeeting}
                  />
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

            {/* Controls */}
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5">
              <button
                onClick={handleAllWorking}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition",
                  allWorking && tableAttendees.size === 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)]",
                )}
                title="Send all agents back to their desks"
              >
                <Briefcase className="h-3.5 w-3.5" />
                All Working
              </button>
              <button
                onClick={handleGather}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition",
                  tableAttendees.size === agents.length && agents.length > 0
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)]",
                )}
                title="Gather all agents to the meeting table"
              >
                <Users className="h-3.5 w-3.5" />
                Gather
              </button>
              {isMeeting ? (
                <button
                  onClick={handleEndMeeting}
                  className="flex items-center gap-2 rounded-md bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50"
                  title="End the meeting"
                >
                  <Pause className="h-3.5 w-3.5" />
                  End Meeting
                </button>
              ) : (
                <button
                  onClick={handleRunMeeting}
                  className="flex items-center gap-2 rounded-md bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-strong transition hover:bg-[color:var(--surface-strong)]"
                  title={tableAttendees.size > 0 ? "Start meeting with agents at the table" : "Gather all agents and start meeting"}
                >
                  <Play className="h-3.5 w-3.5" />
                  Run Meeting
                </button>
              )}
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition",
                  chatOpen
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700",
                )}
                title="Toggle office chat panel"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {chatOpen ? "Close Chat" : "Start Chat"}
              </button>

              {/* Status info */}
              {tableAttendees.size > 0 && (
                <span className="ml-auto text-[11px] text-muted">
                  {tableAttendees.size} at table · {agents.length - tableAttendees.size} at desks
                </span>
              )}
            </div>
          </div>

          {/* Right panel: Chat or Activity */}
          <div className="hidden w-72 shrink-0 lg:block">
            {chatOpen ? (
              <ChatPanel onClose={() => setChatOpen(false)} agents={agents} />
            ) : (
              <ActivityFeed events={activityEvents} isLoading={activityQuery.isLoading} />
            )}
          </div>
        </div>

        {/* Agent status bar */}
        <div className="shrink-0 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
            {agents.map((agent) => {
              const activity = agentActivity(agent);
              const atTable = tableAttendees.has(agent.id);
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    if (atTable) {
                      handleRemoveFromTable(agent.id);
                    } else {
                      handleDropOnTable(agent.id);
                    }
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                    atTable
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                      : "text-strong hover:bg-[color:var(--surface-muted)]",
                  )}
                  title={atTable ? `${agent.name} is at the table (click to send back)` : `${agent.name} is at desk (click to bring to table)`}
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[activity])} />
                  {agent.name}
                  {atTable && <span className="text-[9px]">📋</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}

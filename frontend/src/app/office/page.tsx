"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Building2, Briefcase, Users, ClipboardList, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

import { AgentSprite } from "./components/AgentSprite";
import { ActivityPanel } from "./components/ActivityPanel";
import { ChatPanel } from "./components/ChatPanel";
import { agentActivity, STATUS_DOT, agentDeskPosition, gatherPosition } from "./components/helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "office-meeting-state";
const FLOOR_W = 800;
const FLOOR_H = 520;
const TABLE_CX = FLOOR_W / 2;
const TABLE_CY = FLOOR_H / 2;
const TABLE_W = 160;
const TABLE_H = 80;

// Furniture positions (static decoration)
const PLANTS = [
  { x: 20, y: 20 },
  { x: FLOOR_W - 50, y: 20 },
  { x: 20, y: FLOOR_H - 50 },
  { x: FLOOR_W - 50, y: FLOOR_H - 50 },
];

// ---------------------------------------------------------------------------
// Office Floor Canvas
// ---------------------------------------------------------------------------

function OfficeFloor({
  agents,
  boardMap,
  tableAttendees,
  isMeeting,
  selectedAgent,
  onSelectAgent,
  isLoading,
}: {
  agents: AgentRead[];
  boardMap: Map<string, string>;
  tableAttendees: Set<string>;
  isMeeting: boolean;
  selectedAgent: string | null;
  onSelectAgent: (id: string | null) => void;
  isLoading: boolean;
}) {
  const deskAgents = agents.filter((a) => !tableAttendees.has(a.id));
  const tableAgents = agents.filter((a) => tableAttendees.has(a.id));

  // Group desk agents by board for zone labels
  const zones = useMemo(() => {
    const m = new Map<string, { label: string; agents: { agent: AgentRead; globalIdx: number }[] }>();
    deskAgents.forEach((agent, i) => {
      const bid = agent.board_id ?? "unassigned";
      if (!m.has(bid)) m.set(bid, { label: boardMap.get(bid) ?? "Unassigned", agents: [] });
      m.get(bid)!.agents.push({ agent, globalIdx: agents.indexOf(agent) });
    });
    return m;
  }, [deskAgents, agents, boardMap]);

  // Build desk positions
  const deskPositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    let idx = 0;
    for (const [, zone] of zones) {
      for (const { agent } of zone.agents) {
        pos.set(agent.id, agentDeskPosition(idx, deskAgents.length));
        idx++;
      }
    }
    return pos;
  }, [zones, deskAgents.length]);

  return (
    <div className="relative flex-1 overflow-auto">
      <div
        className="relative mx-auto"
        style={{
          width: FLOOR_W,
          minHeight: FLOOR_H,
          backgroundImage: `
            linear-gradient(45deg, var(--tile-a) 25%, transparent 25%),
            linear-gradient(-45deg, var(--tile-a) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, var(--tile-a) 75%),
            linear-gradient(-45deg, transparent 75%, var(--tile-a) 75%)
          `,
          backgroundSize: "64px 64px",
          backgroundPosition: "0 0, 0 32px, 32px -32px, -32px 0",
          backgroundColor: "var(--tile-b)",
        }}
        onClick={() => onSelectAgent(null)}
      >
        {/* Loading skeleton */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 w-16 animate-pulse rounded-lg bg-[color:var(--surface-strong)] opacity-50" />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && agents.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted">
            <Building2 className="h-12 w-12 opacity-30 mb-3" />
            <p className="text-lg font-medium">Office is empty</p>
            <p className="text-sm mt-1">Add agents to populate the workspace</p>
          </div>
        )}

        {/* Plants */}
        {PLANTS.map((p, i) => (
          <span key={i} className="absolute text-2xl select-none pointer-events-none" style={{ left: p.x, top: p.y }}>
            🪴
          </span>
        ))}

        {/* Zone labels */}
        {Array.from(zones.entries()).map(([bid, zone], zi) => {
          const firstAgent = zone.agents[0];
          if (!firstAgent) return null;
          const pos = deskPositions.get(firstAgent.agent.id);
          if (!pos) return null;
          return (
            <span
              key={bid}
              className="absolute text-[10px] font-bold uppercase tracking-widest text-muted/60 select-none pointer-events-none"
              style={{ left: pos.x - 10, top: pos.y - 24 }}
            >
              {zone.label}
            </span>
          );
        })}

        {/* Desk furniture (behind agents) */}
        {deskAgents.map((agent) => {
          const pos = deskPositions.get(agent.id);
          if (!pos) return null;
          return (
            <div
              key={`desk-${agent.id}`}
              className="absolute rounded border border-[color:var(--border)] bg-[color:var(--surface)]/60 pointer-events-none"
              style={{ left: pos.x - 6, top: pos.y + 60, width: 76, height: 24 }}
            >
              <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[10px] opacity-40">🖥️</span>
            </div>
          );
        })}

        {/* Agents at desks */}
        {deskAgents.map((agent) => {
          const pos = deskPositions.get(agent.id);
          if (!pos) return null;
          return (
            <AgentSprite
              key={agent.id}
              agent={agent}
              index={agents.indexOf(agent)}
              selected={selectedAgent === agent.id}
              onClick={() => { onSelectAgent(agent.id); }}
              style={{ left: pos.x, top: pos.y, transition: "left 0.5s ease, top 0.5s ease" }}
            />
          );
        })}

        {/* Meeting table */}
        <div
          className={cn(
            "absolute rounded-xl border-2 flex items-center justify-center pointer-events-none",
            isMeeting
              ? "border-emerald-400 bg-emerald-500/10"
              : tableAgents.length > 0
                ? "border-indigo-400/50 bg-indigo-500/5"
                : "border-[color:var(--border)] bg-[color:var(--surface)]/40",
          )}
          style={{
            left: TABLE_CX - TABLE_W / 2,
            top: TABLE_CY - TABLE_H / 2,
            width: TABLE_W,
            height: TABLE_H,
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted/50 select-none">
            {isMeeting ? "🗣️ Meeting" : "📋 Table"}
          </span>
          {/* Meeting timer overlay */}
          {isMeeting && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              LIVE
            </span>
          )}
        </div>

        {/* Agents gathered at meeting table */}
        {tableAgents.map((agent, i) => {
          const pos = gatherPosition(i, tableAgents.length, TABLE_CX, TABLE_CY);
          return (
            <AgentSprite
              key={agent.id}
              agent={agent}
              index={agents.indexOf(agent)}
              selected={selectedAgent === agent.id}
              onClick={() => { onSelectAgent(agent.id); }}
              style={{ left: pos.x, top: pos.y, transition: "left 0.5s ease, top 0.5s ease" }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OfficePage() {
  const { isSignedIn } = useAuth();

  // Persisted state
  const loadPersistedState = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { attendees?: string[]; isMeeting?: boolean; allWorking?: boolean; chatOpen?: boolean };
    } catch { return null; }
  }, []);

  const persistState = useCallback(
    (attendees: Set<string>, meeting: boolean, working: boolean, chat: boolean) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          attendees: [...attendees], isMeeting: meeting, allWorking: working, chatOpen: chat,
        }));
      } catch { /* silent */ }
    }, [],
  );

  const [tableAttendees, setTableAttendees] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const s = loadPersistedState(); return s?.attendees ? new Set(s.attendees) : new Set();
  });
  const [isMeeting, setIsMeeting] = useState(() => {
    if (typeof window === "undefined") return false; return loadPersistedState()?.isMeeting ?? false;
  });
  const [allWorking, setAllWorking] = useState(() => {
    if (typeof window === "undefined") return false; return loadPersistedState()?.allWorking ?? false;
  });
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined") return false; return loadPersistedState()?.chatOpen ?? false;
  });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activityCollapsed, setActivityCollapsed] = useState(false);

  useEffect(() => { persistState(tableAttendees, isMeeting, allWorking, chatOpen); },
    [tableAttendees, isMeeting, allWorking, chatOpen, persistState]);

  // Data hooks (PRESERVED)
  const agentsQuery = useListAgentsApiV1AgentsGet<listAgentsApiV1AgentsGetResponse>(
    undefined, { query: { enabled: Boolean(isSignedIn), refetchInterval: 15_000 } },
  );
  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse>(
    undefined, { query: { enabled: Boolean(isSignedIn) } },
  );
  const activityQuery = useListActivityApiV1ActivityGet<listActivityApiV1ActivityGetResponse>(
    { limit: 20 }, { query: { enabled: Boolean(isSignedIn), refetchInterval: 15_000 } },
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
    if (data && typeof data === "object" && "items" in data)
      return (data as { items: Array<{ id: string; event_type: string; message: string; created_at: string }> }).items;
    return [];
  }, [activityQuery.data]);

  // Handlers
  const handleAllWorking = useCallback(() => {
    setTableAttendees(new Set()); setIsMeeting(false); setAllWorking(true);
  }, []);

  const handleGather = useCallback(() => {
    setTableAttendees(new Set(agents.map((a) => a.id))); setAllWorking(false);
  }, [agents]);

  const handleRunMeeting = useCallback(() => {
    if (tableAttendees.size === 0) setTableAttendees(new Set(agents.map((a) => a.id)));
    setIsMeeting(true); setAllWorking(false);
  }, [agents, tableAttendees.size]);

  const handleEndMeeting = useCallback(() => { setIsMeeting(false); }, []);

  const handleAgentTabClick = useCallback((id: string) => {
    setTableAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); if (next.size === 0) setIsMeeting(false); }
      else next.add(id);
      return next;
    });
    setSelectedAgent(id);
  }, []);

  const activeCount = agents.filter((a) => agentActivity(a) === "active").length;
  const idleCount = agents.filter((a) => agentActivity(a) === "idle").length;

  // Responsive: detect width
  const [winWidth, setWinWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  useEffect(() => {
    const h = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", h); return () => window.removeEventListener("resize", h);
  }, []);
  const isMobile = winWidth < 768;
  const isTablet = winWidth >= 768 && winWidth < 1200;

  return (
    <DashboardPageLayout
      signedOut={{ message: "Sign in to view the virtual office.", forceRedirectUrl: "/office" }}
      title={
        <span className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          Virtual Office
        </span>
      }
      description={`${agents.length} agents · ${activeCount} active · ${idleCount} idle`}
    >
      {/* CSS custom properties for tile colors */}
      <style>{`
        :root { --tile-a: #e5e5e5; --tile-b: #f5f5f5; }
        .dark { --tile-a: #262626; --tile-b: #1a1a1a; }
      `}</style>

      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Main area: floor + right panel */}
        <div className="flex flex-1 min-h-0">
          {/* Office floor + demo controls */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Mobile: simplified list view */}
            {isMobile ? (
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {agentsQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-[color:var(--surface-strong)]" />
                    ))}
                  </div>
                ) : agents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted">
                    <Building2 className="h-10 w-10 opacity-30 mb-2" />
                    <p className="font-medium">Office is empty</p>
                  </div>
                ) : (
                  agents.map((agent, i) => {
                    const act = agentActivity(agent);
                    return (
                      <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", STATUS_DOT[act])} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-strong truncate">{agent.name}</p>
                          <p className="text-[11px] text-muted">{boardMap.get(agent.board_id ?? "") ?? "Unassigned"} · {act}</p>
                        </div>
                        {tableAttendees.has(agent.id) && <span className="text-xs">📋</span>}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Desktop/tablet: 2D office floor */
              <OfficeFloor
                agents={agents}
                boardMap={boardMap}
                tableAttendees={tableAttendees}
                isMeeting={isMeeting}
                selectedAgent={selectedAgent}
                onSelectAgent={setSelectedAgent}
                isLoading={agentsQuery.isLoading}
              />
            )}

            {/* Demo Controls Bar */}
            <div className="shrink-0 flex items-center gap-2 border-t border-[color:var(--border)] bg-[color:var(--card,var(--surface))] px-4 h-12">
              <button
                onClick={handleAllWorking}
                className={cn(
                  "flex items-center gap-2 rounded-md h-8 px-4 text-xs font-medium transition",
                  allWorking && tableAttendees.size === 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)]",
                )}
              >
                💼 All Working
              </button>
              <button
                onClick={handleGather}
                className={cn(
                  "flex items-center gap-2 rounded-md h-8 px-4 text-xs font-medium transition",
                  tableAttendees.size === agents.length && agents.length > 0
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)]",
                )}
              >
                🤝 Gather
              </button>
              {isMeeting ? (
                <button onClick={handleEndMeeting} className="flex items-center gap-2 rounded-md h-8 px-4 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-200 transition">
                  📋 End Meeting
                </button>
              ) : (
                <button onClick={handleRunMeeting} className="flex items-center gap-2 rounded-md h-8 px-4 text-xs font-medium bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)] transition">
                  📋 Run Meeting
                </button>
              )}
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={cn(
                  "flex items-center gap-2 rounded-md h-8 px-4 text-xs font-medium transition",
                  chatOpen
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700",
                )}
              >
                💬 {chatOpen ? "Close Chat" : "+ Start Chat"}
              </button>
              {tableAttendees.size > 0 && (
                <span className="ml-auto text-[11px] text-muted">
                  {tableAttendees.size} at table · {agents.length - tableAttendees.size} at desks
                </span>
              )}
              {/* Tablet: activity toggle */}
              {isTablet && (
                <button
                  onClick={() => setActivityCollapsed(!activityCollapsed)}
                  className="ml-auto flex items-center gap-1 rounded-md h-8 px-3 text-xs font-medium bg-[color:var(--surface-muted)] text-strong hover:bg-[color:var(--surface-strong)] transition"
                >
                  📊 Activity
                </button>
              )}
            </div>
          </div>

          {/* Right panel: Activity or Chat */}
          {!isMobile && (
            chatOpen ? (
              <div className="w-[280px] shrink-0">
                <ChatPanel onClose={() => setChatOpen(false)} agents={agents} boards={boards} />
              </div>
            ) : isTablet ? (
              <ActivityPanel
                events={activityEvents}
                isLoading={activityQuery.isLoading}
                collapsed={activityCollapsed}
                onToggle={() => setActivityCollapsed(!activityCollapsed)}
              />
            ) : (
              <ActivityPanel events={activityEvents} isLoading={activityQuery.isLoading} />
            )
          )}
        </div>

        {/* Agent Status Bar (bottom, 48px) */}
        <div className="shrink-0 h-12 border-t border-[color:var(--border)] bg-[color:var(--surface)]">
          <div className="flex items-center h-full gap-1 overflow-x-auto px-4">
            {agents.map((agent) => {
              const act = agentActivity(agent);
              const atTable = tableAttendees.has(agent.id);
              const isSelected = selectedAgent === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => handleAgentTabClick(agent.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 h-8 text-xs transition border-b-2",
                    isSelected
                      ? "border-indigo-500 font-bold text-strong"
                      : atTable
                        ? "border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 font-medium"
                        : "border-transparent text-strong hover:bg-[color:var(--surface-muted)] font-medium",
                  )}
                  title={`${agent.name} — ${act}${atTable ? " (at table)" : ""}`}
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[act])} />
                  {agent.name}
                  {atTable && <span className="text-[9px]">📋</span>}
                </button>
              );
            })}
            {/* Add button */}
            <button className="flex shrink-0 items-center justify-center h-8 w-8 rounded-md text-muted hover:bg-[color:var(--surface-muted)] hover:text-strong transition text-sm" title="Add agent">
              +
            </button>
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}

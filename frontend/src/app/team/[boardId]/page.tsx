"use client";

export const dynamic = "force-dynamic";

import { memo, useMemo, useRef, useCallback, useLayoutEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
  useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet,
} from "@/api/generated/boards/boards";
import type { AgentRead, BoardRead } from "@/api/generated/model";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import {
  Users,
  Crown,
  Bot,
  Wifi,
  WifiOff,
  Clock,
  Search,
  LayoutGrid,
  List,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive agent status from last_seen_at */
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

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  idle: "Idle",
  offline: "Offline",
};

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  idle: "#eab308",
  offline: "#9ca3af",
};

/** Extract skill-like keywords from identity/soul text */
function extractSkills(agent: AgentRead): string[] {
  const profileStr =
    typeof agent.identity_profile === "string"
      ? agent.identity_profile
      : JSON.stringify(agent.identity_profile ?? "");
  const text = [profileStr, agent.soul_template, agent.identity_template]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const SKILL_KEYWORDS: [string, string][] = [
    ["orchestrat", "Orchestration"],
    ["full-stack", "Full-Stack"],
    ["frontend", "Frontend"],
    ["backend", "Backend"],
    ["security", "Security"],
    ["infosec", "Infosec"],
    ["quality", "QA"],
    ["testing", "Testing"],
    ["design", "Design"],
    ["product", "Product"],
    ["devops", "DevOps"],
    ["mobile", "Mobile"],
    ["data", "Data"],
    ["machine learn", "ML"],
    ["research", "Research"],
    ["communication", "Communication"],
    ["engineer", "Engineering"],
    ["ui/ux", "UI/UX"],
    ["ux", "UX"],
  ];
  const found: string[] = [];
  for (const [keyword, label] of SKILL_KEYWORDS) {
    if (text.includes(keyword) && !found.includes(label)) {
      found.push(label);
    }
  }
  return found.slice(0, 4);
}

/** Role title from identity profile or lead status */
function roleTitle(agent: AgentRead): string {
  const profile = agent.identity_profile as
    | Record<string, unknown>
    | null
    | undefined;
  if (profile && typeof profile.role === "string") return profile.role;
  if (agent.identity_template) {
    const firstLine = agent.identity_template.split(/[.\n]/)[0]?.trim() ?? "";
    if (firstLine.length > 5 && firstLine.length < 80) return firstLine;
  }
  return agent.is_board_lead ? "Board Lead" : "Agent";
}

/** Short description from identity or soul template */
function agentDescription(agent: AgentRead): string {
  const profile = agent.identity_profile as
    | Record<string, unknown>
    | null
    | undefined;
  if (profile && typeof profile.description === "string")
    return profile.description;
  if (agent.identity_template) {
    const sentences = agent.identity_template
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    if (sentences.length > 1) return sentences[1] + ".";
    if (sentences.length === 1) return sentences[0] + ".";
  }
  return agent.is_board_lead
    ? "Coordinates team execution and delivery."
    : "Executes assigned work and reports progress.";
}

/** Group agents by gateway (proxy for machine grouping) */
function groupByGateway(
  agents: AgentRead[],
): { gateway_id: string; label: string; agents: AgentRead[] }[] {
  const map = new Map<string, AgentRead[]>();
  for (const a of agents) {
    const key = a.gateway_id ?? "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return Array.from(map.entries()).map(([gw, ags], i) => ({
    gateway_id: gw,
    label: map.size > 1 ? `Node ${i + 1}` : "Gateway",
    agents: ags,
  }));
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const SkillPill = memo(function SkillPill({ skill }: { skill: string }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--team-skill-bg, rgba(217,119,6,0.15))",
        color: "var(--team-skill-text, #b45309)",
      }}
      aria-label={`Skill: ${skill}`}
    >
      {skill}
    </span>
  );
});

const AgentCard = memo(function AgentCard({
  agent,
  id,
}: {
  agent: AgentRead;
  id?: string;
}) {
  const activity = agentActivity(agent);
  const skills = useMemo(() => extractSkills(agent), [agent]);
  const role = useMemo(() => roleTitle(agent), [agent]);
  const desc = useMemo(() => agentDescription(agent), [agent]);

  return (
    <div
      id={id}
      tabIndex={0}
      role="article"
      aria-label={`${agent.name}, ${role}, ${STATUS_LABEL[activity]}`}
      className={cn(
        "group relative flex w-60 flex-col items-center rounded-xl border p-5 transition-all duration-200",
        "border-[color:var(--border)] bg-[color:var(--surface)]",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-[color:var(--accent)]",
        "focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold",
          agent.is_board_lead
            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
            : "bg-[color:var(--surface-strong)] text-[color:var(--text-muted)]",
        )}
      >
        {agent.is_board_lead ? (
          <Crown className="h-7 w-7" />
        ) : (
          <Bot className="h-7 w-7" />
        )}
      </div>

      {/* Name + status dot */}
      <div className="mt-3 flex items-center gap-2">
        <h3 className="text-base font-semibold text-[color:var(--text)]">
          {agent.name}
        </h3>
        <span
          className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[activity])}
          title={STATUS_LABEL[activity]}
        />
      </div>

      {/* Role */}
      <p className="mt-1 text-center text-xs font-medium text-[color:var(--accent)]">
        {role}
      </p>

      {/* Description */}
      <p className="mt-2 line-clamp-2 text-center text-xs text-[color:var(--text-muted)]">
        {desc}
      </p>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {skills.map((s) => (
            <SkillPill key={s} skill={s} />
          ))}
        </div>
      )}

      {/* Status line */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
        {activity === "active" ? (
          <Wifi className="h-3 w-3 text-emerald-500" />
        ) : activity === "idle" ? (
          <Clock className="h-3 w-3 text-amber-400" />
        ) : (
          <WifiOff className="h-3 w-3 text-gray-400" />
        )}
        {STATUS_LABEL[activity]}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// SVG Org Lines
// ---------------------------------------------------------------------------

interface OrgLineProps {
  leads: AgentRead[];
  workers: AgentRead[];
}

/**
 * Draw SVG lines from lead cards (bottom-center) to worker cards (top-center).
 * Uses refs to read actual DOM positions for accurate line routing.
 */
function OrgLines({ parentIds, childIds, containerRef }: {
  parentIds: string[];
  childIds: string[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; midY: number }[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setDims({ w: rect.width, h: rect.height });

    const newLines: typeof lines = [];
    for (const pid of parentIds) {
      const pEl = document.getElementById(pid);
      if (!pEl) continue;
      const pRect = pEl.getBoundingClientRect();
      const px = pRect.left + pRect.width / 2 - rect.left;
      const py = pRect.bottom - rect.top;

      for (const cid of childIds) {
        const cEl = document.getElementById(cid);
        if (!cEl) continue;
        const cRect = cEl.getBoundingClientRect();
        const cx = cRect.left + cRect.width / 2 - rect.left;
        const cy = cRect.top - rect.top;
        const midY = py + (cy - py) / 2;
        newLines.push({ x1: px, y1: py, x2: cx, y2: cy, midY });
      }
    }
    setLines(newLines);
  }, [parentIds, childIds, containerRef]);

  useLayoutEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc, containerRef]);

  if (lines.length === 0 || dims.w === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={dims.w}
      height={dims.h}
      aria-hidden
    >
      {lines.map((l, i) => (
        <path
          key={i}
          d={`M${l.x1},${l.y1} L${l.x1},${l.midY} L${l.x2},${l.midY} L${l.x2},${l.y2}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={2}
          strokeDasharray="none"
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Machine Group
// ---------------------------------------------------------------------------

const MachineGroup = memo(function MachineGroup({
  label,
  agents,
  groupIndex,
}: {
  label: string;
  agents: AgentRead[];
  groupIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leads = agents.filter((a) => a.is_board_lead);
  const workers = agents.filter((a) => !a.is_board_lead);

  const parentIds = leads.map((a) => `card-${a.id}`);
  const childIds = workers.map((a) => `card-${a.id}`);

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
      {/* Machine header */}
      <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
        <Monitor className="h-4 w-4 text-[color:var(--text-muted)]" />
        <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--text-muted)]">
          {label}
        </span>
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">
          {agents.length} agent{agents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards + org lines */}
      <div ref={containerRef} className="relative px-6 py-8">
        <OrgLines
          parentIds={parentIds}
          childIds={childIds}
          containerRef={containerRef}
        />

        {/* Leads row */}
        {leads.length > 0 && (
          <div className="relative z-10 flex flex-wrap justify-center gap-6">
            {leads.map((a) => (
              <AgentCard key={a.id} agent={a} id={`card-${a.id}`} />
            ))}
          </div>
        )}

        {/* Spacer for org lines */}
        {leads.length > 0 && workers.length > 0 && (
          <div className="h-12" />
        )}

        {/* Workers row */}
        {workers.length > 0 && (
          <div className="relative z-10 flex flex-wrap justify-center gap-6">
            {workers.map((a) => (
              <AgentCard key={a.id} agent={a} id={`card-${a.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

const AgentListRow = memo(function AgentListRow({
  agent,
}: {
  agent: AgentRead;
}) {
  const activity = agentActivity(agent);
  const role = useMemo(() => roleTitle(agent), [agent]);
  const skills = useMemo(() => extractSkills(agent), [agent]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 transition-colors hover:bg-[color:var(--surface-muted)]">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          agent.is_board_lead
            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
            : "bg-[color:var(--surface-strong)] text-[color:var(--text-muted)]",
        )}
      >
        {agent.is_board_lead ? (
          <Crown className="h-5 w-5" />
        ) : (
          <Bot className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[color:var(--text)]">
            {agent.name}
          </span>
          <span
            className={cn("h-2 w-2 rounded-full", STATUS_DOT[activity])}
          />
          <span className="text-xs text-[color:var(--text-muted)]">
            {STATUS_LABEL[activity]}
          </span>
        </div>
        <p className="text-xs text-[color:var(--accent)]">{role}</p>
      </div>
      <div className="hidden gap-1.5 sm:flex">
        {skills.map((s) => (
          <SkillPill key={s} skill={s} />
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { isSignedIn } = useAuth();
  const [view, setView] = useState<"org" | "list">("org");
  const [search, setSearch] = useState("");

  const snapshotQuery =
    useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet<
      getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
      ApiError
    >(boardId ?? "", {
      query: {
        enabled: Boolean(isSignedIn && boardId),
        refetchInterval: 30_000,
      },
    });

  const snapshotData = snapshotQuery.data?.data as
    | { board?: BoardRead; agents?: AgentRead[] }
    | undefined;
  const board: BoardRead | undefined = snapshotData?.board;
  const allAgents: AgentRead[] = snapshotData?.agents ?? [];

  // Filter by search
  const agents = useMemo(() => {
    if (!search.trim()) return allAgents;
    const q = search.toLowerCase();
    return allAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        roleTitle(a).toLowerCase().includes(q) ||
        extractSkills(a).some((s) => s.toLowerCase().includes(q)),
    );
  }, [allAgents, search]);

  const groups = useMemo(() => groupByGateway(agents), [agents]);

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view the team page.",
        forceRedirectUrl: `/team/${boardId}`,
      }}
      title={
        <span className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          {board?.name ?? "Team"}
        </span>
      }
      description={`${allAgents.length} agent${allAgents.length !== 1 ? "s" : ""} on this board`}
    >
      <div className="space-y-6">
        {/* Quote banner */}
        <div className="rounded-lg bg-[color:var(--surface-muted)] px-8 py-5 text-center">
          <p className="text-sm italic text-[color:var(--text-muted)]">
            &ldquo;An autonomous organization of AI agents working together to
            deliver results.&rdquo;
          </p>
        </div>

        {/* Toolbar: search + view toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents, roles, skills..."
              className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] py-2 pl-9 pr-3 text-sm text-[color:var(--text)] placeholder-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
            />
          </div>
          <div className="flex rounded-lg border border-[color:var(--border)] overflow-hidden">
            <button
              onClick={() => setView("org")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                view === "org"
                  ? "bg-[color:var(--accent)] text-white"
                  : "bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Org Chart
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                view === "list"
                  ? "bg-[color:var(--accent)] text-white"
                  : "bg-[color:var(--surface)] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]",
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>

        {/* Loading */}
        {snapshotQuery.isLoading && (
          <div className="flex flex-wrap justify-center gap-6 py-12">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 w-60 animate-pulse rounded-xl bg-[color:var(--surface-strong)]"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {snapshotQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
            Failed to load team data.{" "}
            <button
              onClick={() => snapshotQuery.refetch()}
              className="underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty after search */}
        {!snapshotQuery.isLoading &&
          !snapshotQuery.isError &&
          agents.length === 0 &&
          allAgents.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-[color:var(--text-muted)]">
              <Search className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-base font-medium">No agents match &ldquo;{search}&rdquo;</p>
              <button
                onClick={() => setSearch("")}
                className="mt-2 text-sm text-[color:var(--accent)] underline"
              >
                Clear search
              </button>
            </div>
          )}

        {/* Empty board */}
        {!snapshotQuery.isLoading &&
          !snapshotQuery.isError &&
          allAgents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-[color:var(--text-muted)]">
              <Users className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">No agents in this team</p>
              <p className="text-sm">Add agents to see them here.</p>
            </div>
          )}

        {/* Org Chart View */}
        {!snapshotQuery.isLoading &&
          !snapshotQuery.isError &&
          agents.length > 0 &&
          view === "org" && (
            <div className="space-y-8">
              {groups.map((g) => (
                <MachineGroup
                  key={g.gateway_id}
                  label={g.label}
                  agents={g.agents}
                  groupIndex={0}
                />
              ))}
            </div>
          )}

        {/* List View */}
        {!snapshotQuery.isLoading &&
          !snapshotQuery.isError &&
          agents.length > 0 &&
          view === "list" && (
            <div className="space-y-2">
              {agents.map((a) => (
                <AgentListRow key={a.id} agent={a} />
              ))}
            </div>
          )}
      </div>
    </DashboardPageLayout>
  );
}

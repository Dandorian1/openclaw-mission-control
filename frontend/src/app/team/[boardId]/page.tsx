"use client";

export const dynamic = "force-dynamic";

import { memo, useMemo } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
  useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet,
} from "@/api/generated/boards/boards";
import type { AgentRead, BoardRead } from "@/api/generated/model";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Users, Crown, Bot, Wifi, WifiOff, Clock } from "lucide-react";
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

/** Extract skill-like keywords from identity/soul text */
function extractSkills(agent: AgentRead): string[] {
  const profileStr = typeof agent.identity_profile === "string"
    ? agent.identity_profile
    : JSON.stringify(agent.identity_profile ?? "");
  const text = [profileStr, agent.soul_template]
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
  const profile = agent.identity_profile as Record<string, unknown> | null | undefined;
  if (profile && typeof profile.role === "string") return profile.role;
  if (agent.identity_template) {
    const firstLine = agent.identity_template.split(/[.\n]/)[0]?.trim() ?? "";
    if (firstLine.length > 5 && firstLine.length < 80) return firstLine;
  }
  return agent.is_board_lead ? "Board Lead" : "Agent";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const SkillPill = memo(function SkillPill({ skill }: { skill: string }) {
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      {skill}
    </span>
  );
});

const AgentCard = memo(function AgentCard({ agent }: { agent: AgentRead }) {
  const activity = agentActivity(agent);
  const skills = useMemo(() => extractSkills(agent), [agent]);
  const role = useMemo(() => roleTitle(agent), [agent]);

  return (
    <div
      className={cn(
        "group relative flex w-60 flex-col items-center rounded-xl border p-5 transition-all duration-200",
        "border-[color:var(--border)] bg-[color:var(--surface)]",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-[color:var(--border-strong)]",
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold",
        agent.is_board_lead
          ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
          : "bg-[color:var(--surface-strong)] text-muted"
      )}>
        {agent.is_board_lead ? <Crown className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
      </div>

      {/* Name + status */}
      <div className="mt-3 flex items-center gap-2">
        <h3 className="text-base font-semibold text-strong">{agent.name}</h3>
        <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[activity])} title={STATUS_LABEL[activity]} />
      </div>

      {/* Role */}
      <p className="mt-1 text-center text-xs font-medium text-[color:var(--accent)]">{role}</p>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {skills.map((s) => (
            <SkillPill key={s} skill={s} />
          ))}
        </div>
      )}

      {/* Status line */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
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

const OrgChart = memo(function OrgChart({ agents }: { agents: AgentRead[] }) {
  const leads = agents.filter((a) => a.is_board_lead);
  const workers = agents.filter((a) => !a.is_board_lead);

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <Users className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No agents in this team</p>
        <p className="text-sm">Add agents to see them here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Leads row */}
      {leads.length > 0 && (
        <div className="flex flex-wrap justify-center gap-6">
          {leads.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}

      {/* Org line */}
      {leads.length > 0 && workers.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="h-8 w-0.5 bg-[color:var(--border)]" />
          <div
            className="h-0.5 bg-[color:var(--border)]"
            style={{ width: `${Math.min(workers.length * 270, 900)}px` }}
          />
          <div className="flex justify-center" style={{ width: `${Math.min(workers.length * 270, 900)}px` }}>
            {workers.map((_, i) => (
              <div
                key={i}
                className="h-8 w-0.5 bg-[color:var(--border)]"
                style={{ flex: 1, maxWidth: "270px" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Workers row */}
      {workers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-6">
          {workers.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { isSignedIn } = useAuth();

  const snapshotQuery = useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet<
    getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
    ApiError
  >(boardId ?? "", {
    query: {
      enabled: Boolean(isSignedIn && boardId),
      refetchInterval: 30_000,
    },
  });

  const snapshotData = snapshotQuery.data?.data as { board?: BoardRead; agents?: AgentRead[] } | undefined;
  const board: BoardRead | undefined = snapshotData?.board;
  const agents: AgentRead[] = snapshotData?.agents ?? [];

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
      description={`${agents.length} agent${agents.length !== 1 ? "s" : ""} on this board`}
    >
      <div className="space-y-6">

        {/* Quote banner */}
        <div className="rounded-lg bg-[color:var(--surface-muted)] px-8 py-5 text-center">
          <p className="text-sm italic text-muted">
            &ldquo;An autonomous organization of AI agents working together to deliver results.&rdquo;
          </p>
        </div>

        {/* Loading */}
        {snapshotQuery.isLoading && (
          <div className="flex flex-wrap justify-center gap-6 py-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-52 w-60 animate-pulse rounded-xl bg-[color:var(--surface-strong)]" />
            ))}
          </div>
        )}

        {/* Error */}
        {snapshotQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
            Failed to load team data. <button onClick={() => snapshotQuery.refetch()} className="underline">Retry</button>
          </div>
        )}

        {/* Org chart */}
        {!snapshotQuery.isLoading && !snapshotQuery.isError && (
          <OrgChart agents={agents} />
        )}
      </div>
    </DashboardPageLayout>
  );
}

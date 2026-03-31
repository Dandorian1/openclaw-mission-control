"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Clock,
  Coins,
  Cpu,
  Download,
  RefreshCw,
  Zap,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { LoadingState } from "@/components/ui/loading-state";
import { InlineError } from "@/components/ui/inline-error";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError, customFetch } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type gatewaysStatusApiV1GatewaysStatusGetResponse,
  useGatewaysStatusApiV1GatewaysStatusGet,
} from "@/api/generated/gateways/gateways";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────── */

interface SessionUsageEntry {
  key?: string;
  label?: string;
  model?: string;
  modelProvider?: string;
  agentId?: string;
  usage?: {
    totalTokens?: number;
    totalCost?: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    messageCounts?: { total?: number; user?: number; assistant?: number; toolCalls?: number };
    latency?: { avgMs?: number; p95Ms?: number };
    modelUsage?: { provider?: string; model?: string; count?: number; totals?: { totalTokens?: number; totalCost?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number } }[];
    dailyBreakdown?: { date?: string; tokens?: number; cost?: number }[];
    toolUsage?: { totalCalls?: number; uniqueTools?: number; tools?: { name?: string; count?: number }[] };
  };
  [k: string]: unknown;
}

interface UsageData {
  usage: SessionUsageEntry[];
  summary?: Record<string, unknown> | null;
  error?: string | null;
}

interface SessionEntry {
  key?: string;
  label?: string;
  model?: string;
  updatedAtMs?: number;
  statsLine?: string;
  [k: string]: unknown;
}

interface ProviderUsageData {
  providers: Record<string, unknown>[];
  raw?: Record<string, unknown> | null;
  error?: string | null;
}

interface CostData {
  daily: { date?: string; totalTokens?: number; totalCost?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number }[];
  totals?: { totalTokens?: number; totalCost?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | null;
  days?: number | null;
  error?: string | null;
}

type TimeRange = "24h" | "7d" | "30d" | "90d";

/* ── Helpers ───────────────────────────────────────── */

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const MODEL_COLORS: Record<string, string> = {
  "claude-sonnet": "bg-purple-500",
  "claude-opus": "bg-blue-500",
  "claude-haiku": "bg-emerald-500",
  "gpt-4o": "bg-teal-500",
  "gemini": "bg-yellow-500",
};

function modelColor(modelName: string): string {
  const lower = modelName.toLowerCase();
  for (const [key, cls] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return "bg-gray-400";
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Skeleton Shimmer ──────────────────────────────── */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-[color:var(--surface-strong)]", className)} />
  );
}

function KpiSkeleton() {
  return (
    <div className="flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <SkeletonBlock className="h-3 w-20" />
      <div>
        <SkeletonBlock className="h-10 w-24" />
        <SkeletonBlock className="mt-2 h-3 w-16" />
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────── */

export default function UsagePage() {
  const { isSignedIn } = useAuth();
  useOrganizationMembership(isSignedIn);

  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [sessionPage, setSessionPage] = useState(0);
  const SESSIONS_PER_PAGE = 10;

  /* ── Data queries (PRESERVED) ── */

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), refetchInterval: 60_000 } });
  const boards = boardsQuery.data?.status === 200 ? boardsQuery.data.data?.items ?? [] : [];
  const firstBoardId = boards.length > 0 ? (boards[0] as unknown as Record<string, unknown>)?.id as string | undefined : undefined;

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), refetchInterval: 60_000 } });
  const agents = agentsQuery.data?.status === 200 ? agentsQuery.data.data?.items ?? [] : [];

  const statusQuery = useGatewaysStatusApiV1GatewaysStatusGet<
    gatewaysStatusApiV1GatewaysStatusGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), refetchInterval: 30_000 } });
  const gatewayStatus = statusQuery.data?.status === 200 ? statusQuery.data.data : null;
  const sessions: SessionEntry[] = useMemo(() => {
    const raw = (gatewayStatus as Record<string, unknown> | null)?.sessions;
    return Array.isArray(raw) ? raw as SessionEntry[] : [];
  }, [gatewayStatus]);

  /* ── Usage / cost / provider state (PRESERVED) ── */

  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [providerUsage, setProviderUsage] = useState<ProviderUsageData | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [costData, setCostData] = useState<CostData | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!firstBoardId) return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await customFetch<{ data: UsageData; status: number }>(
        `/api/v1/gateways/usage?board_id=${firstBoardId}`,
        { method: "GET" },
      );
      if (res.status === 200) setUsageData(res.data);
      else setUsageError("Failed to load usage data");
    } catch {
      setUsageError("Failed to load usage data");
    } finally {
      setUsageLoading(false);
    }
  }, [firstBoardId]);

  const fetchCost = useCallback(async () => {
    if (!firstBoardId) return;
    try {
      const days = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      const res = await customFetch<{ data: CostData; status: number }>(
        `/api/v1/gateways/usage/cost?board_id=${firstBoardId}&days=${days}`,
        { method: "GET" },
      );
      if (res.status === 200) setCostData(res.data);
    } catch { /* silent */ }
  }, [firstBoardId, timeRange]);

  const fetchProviderUsage = useCallback(async () => {
    if (!firstBoardId) return;
    setProviderLoading(true);
    try {
      const res = await customFetch<{ data: ProviderUsageData; status: number }>(
        `/api/v1/gateways/usage/providers?board_id=${firstBoardId}`,
        { method: "GET" },
      );
      if (res.status === 200) setProviderUsage(res.data);
    } catch { /* silent */ } finally {
      setProviderLoading(false);
    }
  }, [firstBoardId]);

  useEffect(() => {
    if (firstBoardId && isSignedIn) {
      void fetchUsage();
      void fetchProviderUsage();
      void fetchCost();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstBoardId, isSignedIn, timeRange]);

  const refreshAll = () => { void fetchUsage(); void fetchProviderUsage(); void fetchCost(); };

  /* ── Derived stats (PRESERVED) ── */

  const sessionStats = useMemo(() => {
    const modelCounts: Record<string, number> = {};
    const totalSessions = sessions.length;
    let activeSessions = 0;
    const now = Date.now();
    for (const s of sessions) {
      const model = (s.model as string) || "default";
      modelCounts[model] = (modelCounts[model] || 0) + 1;
      const updated = s.updatedAtMs as number | undefined;
      if (updated && now - updated < 30 * 60 * 1000) activeSessions++;
    }
    return { totalSessions, activeSessions, modelCounts };
  }, [sessions]);

  const usageStats = useMemo(() => {
    if (!usageData?.usage?.length) return null;
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalRuns = 0, totalCost = 0, totalMessages = 0, totalToolCalls = 0;
    const byModel: Record<string, { input: number; output: number; cacheRead: number; runs: number; cost: number }> = {};
    for (const entry of usageData.usage) {
      const u = entry.usage;
      if (!u) continue;
      totalInput += u.input || 0;
      totalOutput += u.output || 0;
      totalCacheRead += u.cacheRead || 0;
      totalCost += u.totalCost || 0;
      totalMessages += u.messageCounts?.assistant || 0;
      totalToolCalls += u.messageCounts?.toolCalls || 0;
      if (u.modelUsage) {
        for (const mu of u.modelUsage) {
          const key = `${mu.provider || ""}/${mu.model || "unknown"}`;
          if (!byModel[key]) byModel[key] = { input: 0, output: 0, cacheRead: 0, runs: 0, cost: 0 };
          byModel[key].input += mu.totals?.input || 0;
          byModel[key].output += mu.totals?.output || 0;
          byModel[key].cacheRead += mu.totals?.cacheRead || 0;
          byModel[key].runs += mu.count || 0;
          byModel[key].cost += mu.totals?.totalCost || 0;
          totalRuns += mu.count || 0;
        }
      }
    }
    return { totalInput, totalOutput, totalCacheRead, totalRuns, totalCost, totalMessages, totalToolCalls, byModel };
  }, [usageData]);

  const agentUsageLookup = useMemo(() => {
    const lookup = new Map<string, { tokens: number; cost: number; messages: number; name?: string }>();
    if (!usageData?.usage) return lookup;
    for (const entry of usageData.usage) {
      const agentId = entry.agentId;
      if (!agentId || !entry.usage) continue;
      const existing = lookup.get(agentId) || { tokens: 0, cost: 0, messages: 0 };
      existing.tokens += entry.usage.totalTokens || 0;
      existing.cost += entry.usage.totalCost || 0;
      existing.messages += entry.usage.messageCounts?.assistant || 0;
      if (entry.label) existing.name = entry.label;
      lookup.set(agentId, existing);
    }
    return lookup;
  }, [usageData]);

  /* ── Top agents ranked ── */
  const topAgents = useMemo(() => {
    const entries = Array.from(agentUsageLookup.entries())
      .map(([id, data]) => {
        const agent = agents.find((a) => {
          const aa = a as unknown as Record<string, unknown>;
          return aa.id === id;
        });
        const name = (agent as unknown as Record<string, unknown>)?.name as string || data.name || id;
        return { id, name, tokens: data.tokens, cost: data.cost };
      })
      .filter(a => a.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
    return entries;
  }, [agentUsageLookup, agents]);

  /* ── Session rows for table ── */
  const sessionRows = useMemo(() => {
    return sessions.map(s => {
      const agentId = (s.key as string || "").replace(/^agent:/, "").split(":")[0];
      const agent = agents.find(a => {
        const aa = a as unknown as Record<string, unknown>;
        return aa.id === agentId;
      });
      const agentName = (agent as unknown as Record<string, unknown>)?.name as string || s.label || agentId || "Unknown";
      const model = s.model as string || "default";
      const usage = agentUsageLookup.get(agentId);
      const updatedAt = s.updatedAtMs as number || 0;
      return {
        agentName,
        model,
        tokens: usage?.tokens || 0,
        cost: usage?.cost || 0,
        duration: updatedAt ? relativeTime(updatedAt) : "—",
        startedAt: updatedAt,
      };
    }).sort((a, b) => b.startedAt - a.startedAt);
  }, [sessions, agents, agentUsageLookup]);

  /* ── Daily chart data ── */
  const chartBars = useMemo(() => {
    if (!costData?.daily?.length) return [];
    const days = [...costData.daily].reverse();
    const maxTokens = Math.max(...days.map(d => (d.input || 0) + (d.output || 0)), 1);
    return days.map(d => {
      const input = d.input || 0;
      const output = d.output || 0;
      const total = input + output;
      const date = d.date || "";
      const dayLabel = date ? new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }) : "";
      return {
        date,
        dayLabel,
        input,
        output,
        inputPct: (input / maxTokens) * 100,
        outputPct: (output / maxTokens) * 100,
        totalPct: (total / maxTokens) * 100,
      };
    });
  }, [costData]);

  /* ── CSV export ── */
  const exportCsv = () => {
    if (!costData?.daily?.length) return;
    const header = "Date,Input,Output,CacheRead,TotalTokens,Cost\n";
    const rows = costData.daily.map(d =>
      `${d.date},${d.input || 0},${d.output || 0},${d.cacheRead || 0},${d.totalTokens || 0},${d.totalCost?.toFixed(4) || 0}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${timeRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Auth guard ── */

  if (!isSignedIn) {
    return (
      <DashboardShell>
        <SignedOutPanel
          message="Sign in to view AI usage."
          forceRedirectUrl="/usage"
          signUpForceRedirectUrl="/usage"
        />
      </DashboardShell>
    );
  }

  const isLoading = usageLoading && !usageData;
  const hasNoData = !usageLoading && !usageData?.usage?.length && !costData?.daily?.length;
  const totalTokens = usageStats ? usageStats.totalInput + usageStats.totalOutput : 0;

  return (
    <DashboardShell>
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto bg-app">
        <div className="mx-auto max-w-6xl space-y-6 p-6">

          {/* ─── 1. Usage Header ─── */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-strong">AI Usage Dashboard</h1>
              <p className="mt-1 text-sm text-muted">Monitor token consumption and costs</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-strong focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-strong transition hover:bg-[color:var(--surface-strong)]"
              >
                <Download className="h-4 w-4" /> Export
              </button>
              <button
                onClick={refreshAll}
                disabled={usageLoading || providerLoading}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-strong transition hover:bg-[color:var(--surface-strong)]",
                  usageLoading && "opacity-50 cursor-not-allowed",
                )}
              >
                <RefreshCw className={cn("h-4 w-4", (usageLoading || providerLoading) && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* ─── Loading state ─── */}
          {isLoading && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}
              </div>
              <SkeletonBlock className="h-[300px] w-full" />
            </>
          )}

          {/* ─── No data state ─── */}
          {hasNoData && !isLoading && !usageError && (
            <EmptyState
              title="No usage data yet"
              description="Once your agents start running, token consumption and costs will appear here."
              icon={<BarChart3 className="h-12 w-12" />}
            />
          )}

          {/* ─── Error state ─── */}
          {(usageError || usageData?.error) && (
            <InlineError
              message={usageError || usageData?.error || "Unknown error"}
              className="flex items-center justify-between"
            >
              <button onClick={refreshAll} className="ml-2 text-xs underline">Retry</button>
            </InlineError>
          )}

          {/* ─── 2. KPI Tiles ─── */}
          {!isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Total Tokens */}
              <div className="group flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-none dark:hover:shadow-none">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Total Tokens</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]">
                    <BarChart3 className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-[40px] font-bold leading-none text-strong">{usageStats ? formatTokens(totalTokens) : "—"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {usageStats ? `${formatTokens(usageStats.totalInput)} in · ${formatTokens(usageStats.totalOutput)} out` : "No data"}
                  </p>
                </div>
              </div>

              {/* Total Cost */}
              <div className="group flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-none dark:hover:shadow-none">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Total Cost</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]">
                    <Coins className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-[40px] font-bold leading-none text-strong">
                    {usageStats?.totalCost ? `$${usageStats.totalCost.toFixed(2)}` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {usageStats ? `${usageStats.totalRuns} runs` : "No data"}
                  </p>
                </div>
              </div>

              {/* Sessions */}
              <div className="group flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-none dark:hover:shadow-none">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Sessions</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]">
                    <Bot className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-[40px] font-bold leading-none text-strong">{sessionStats.totalSessions}</p>
                  <p className="mt-1 text-xs text-muted">{sessionStats.activeSessions} active</p>
                </div>
              </div>

              {/* Active Models */}
              <div className="group flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-none dark:hover:shadow-none">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Active Models</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]">
                    <Cpu className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-[40px] font-bold leading-none text-strong">{Object.keys(sessionStats.modelCounts).length}</p>
                  <p className="mt-1 text-xs text-muted">unique models</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── 3. Token Usage Chart (CSS-only stacked bars) ─── */}
          {chartBars.length > 0 && (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-strong">Token Usage</h2>
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500 dark:bg-blue-400" /> Input
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500 dark:bg-violet-400" /> Output
                  </span>
                </div>
              </div>
              <div className="flex h-[300px] items-end gap-1 px-4 pb-2 pt-4">
                {chartBars.map((bar, idx) => (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-0">
                    <div className="flex w-full flex-col items-center justify-end" style={{ height: 240 }}>
                      <div
                        className="w-full max-w-[40px] rounded-t-sm bg-violet-500 dark:bg-violet-400 transition-all duration-300"
                        style={{ height: `${bar.outputPct * 2.4}px` }}
                        title={`Output: ${formatTokens(bar.output)}`}
                      />
                      <div
                        className="w-full max-w-[40px] bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                        style={{ height: `${bar.inputPct * 2.4}px` }}
                        title={`Input: ${formatTokens(bar.input)}`}
                      />
                    </div>
                    <span className="mt-1 text-[10px] text-muted truncate w-full text-center">{bar.dayLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── 4. Two-Column: Cost by Model + Top Agents ─── */}
          {(usageStats || topAgents.length > 0) && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {/* Cost by Model */}
              {usageStats && Object.keys(usageStats.byModel).length > 0 && (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
                  <div className="border-b border-[color:var(--border)] px-4 py-3">
                    <h2 className="text-sm font-semibold text-strong">Cost by Model</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    {Object.entries(usageStats.byModel)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([model, data]) => {
                        const maxCost = Math.max(...Object.values(usageStats.byModel).map(m => m.cost), 1);
                        const pct = (data.cost / maxCost) * 100;
                        const shortModel = model.split("/").pop() || model;
                        return (
                          <div key={model}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-medium text-strong truncate max-w-[60%]">{shortModel}</span>
                              <span className="text-muted">${data.cost.toFixed(2)}</span>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all duration-500", modelColor(shortModel))}
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    <div className="mt-2 flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-sm font-semibold">
                      <span className="text-strong">Total</span>
                      <span className="text-strong">${usageStats.totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Top Agents by Usage */}
              {topAgents.length > 0 && (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
                  <div className="border-b border-[color:var(--border)] px-4 py-3">
                    <h2 className="text-sm font-semibold text-strong">Top Agents by Usage</h2>
                  </div>
                  <div className="space-y-3 p-4">
                    {topAgents.slice(0, 5).map((agent, idx) => {
                      const maxTokens = topAgents[0]?.tokens || 1;
                      const pct = (agent.tokens / maxTokens) * 100;
                      return (
                        <div key={agent.id} className="flex items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-strong)] text-xs font-bold text-muted">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-medium text-strong truncate">{agent.name}</span>
                              <span className="text-muted text-xs">{formatTokens(agent.tokens)}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-500"
                                style={{ width: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {topAgents.length > 5 && (
                      <a href="/team" className="mt-2 block text-right text-xs font-medium text-[color:var(--accent)] hover:underline">
                        View All →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── 5. Recent Sessions Table ─── */}
          {sessionRows.length > 0 && (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <div className="border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-strong">Recent Sessions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border)] text-left text-muted">
                      <th className="px-4 py-3 font-medium">Agent</th>
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium text-right">Tokens</th>
                      <th className="px-4 py-3 font-medium text-right">Cost</th>
                      <th className="px-4 py-3 font-medium text-right">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows
                      .slice(sessionPage * SESSIONS_PER_PAGE, (sessionPage + 1) * SESSIONS_PER_PAGE)
                      .map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-strong)] text-xs font-bold text-muted">
                                {row.agentName.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium text-strong">{row.agentName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs">
                              {row.model.split("/").pop()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-muted">{row.tokens > 0 ? formatTokens(row.tokens) : "—"}</td>
                          <td className="px-4 py-3 text-right font-medium text-strong">{row.cost > 0 ? `$${row.cost.toFixed(2)}` : "—"}</td>
                          <td className="px-4 py-3 text-right text-muted">
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{row.duration}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {sessionRows.length > SESSIONS_PER_PAGE && (
                <div className="flex items-center justify-between border-t border-[color:var(--border)] px-4 py-3">
                  <p className="text-xs text-muted">
                    Showing {sessionPage * SESSIONS_PER_PAGE + 1}–{Math.min((sessionPage + 1) * SESSIONS_PER_PAGE, sessionRows.length)} of {sessionRows.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSessionPage(p => Math.max(0, p - 1))}
                      disabled={sessionPage === 0}
                      className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-muted hover:bg-[color:var(--surface-strong)] disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setSessionPage(p => p + 1)}
                      disabled={(sessionPage + 1) * SESSIONS_PER_PAGE >= sessionRows.length}
                      className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-muted hover:bg-[color:var(--surface-strong)] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Provider Usage Limits (PRESERVED) ─── */}
          {(providerUsage?.raw || providerUsage?.providers?.length) && !providerUsage?.error ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
              <div className="border-b border-[color:var(--border)] px-4 py-3">
                <h2 className="text-sm font-semibold text-strong">Provider Usage Limits</h2>
                <p className="text-xs text-muted mt-0.5">Live quota and rate limit status from AI providers</p>
              </div>
              <div className="p-4">
                {providerUsage.providers.length > 0 ? (
                  <div className="space-y-3">
                    {providerUsage.providers.map((provider, idx) => {
                      const displayName = (provider.displayName || provider.name || provider.provider || `Provider ${idx + 1}`) as string;
                      const plan = provider.plan as string | undefined;
                      const windows = provider.windows as { label: string; usedPercent: number; resetAt?: number }[] | undefined;
                      const error = provider.error as string | undefined;
                      const formatResetTime = (resetAt: number) => {
                        const diff = resetAt - Date.now();
                        if (diff <= 0) return "now";
                        const hours = Math.floor(diff / 3600000);
                        const mins = Math.floor((diff % 3600000) / 60000);
                        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                      };
                      return (
                        <div key={idx} className="rounded-lg border border-[color:var(--border)] p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-strong">{displayName}</p>
                            {plan ? (
                              <span className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs text-muted">{plan}</span>
                            ) : null}
                          </div>
                          {error ? (
                            error.includes("429") || error.includes("Rate limited") ? (
                              <div className="mt-3 space-y-3">
                                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 dark:bg-rose-950">
                                  <Zap className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                  <p className="text-xs font-medium text-rose-700 dark:text-rose-300">Usage cap likely exhausted — provider returning rate limit (429)</p>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="font-medium text-strong">Estimated usage</span>
                                    <span className="font-medium text-rose-600 dark:text-rose-400">~100% used</span>
                                  </div>
                                  <div className="h-2.5 w-full rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                                    <div className="h-full rounded-full bg-rose-500 transition-all duration-500" style={{ width: "100%" }} />
                                  </div>
                                  <p className="mt-1 text-xs text-muted">Agents are receiving 429 errors. Cap resets automatically — check back later.</p>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                    {error.includes("user:profile")
                                      ? "Usage data unavailable — token missing required scope"
                                      : error.includes("401") || error.includes("Invalid bearer token") || error.includes("Unauthorized")
                                      ? "Usage data unavailable — auth token cannot access usage API"
                                      : error}
                                  </p>
                                </div>
                                {(error.includes("user:profile") || error.includes("401") || error.includes("Invalid bearer token") || error.includes("Unauthorized")) && (
                                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 space-y-1">
                                    <p>
                                      {error.includes("401") || error.includes("Invalid bearer token") || error.includes("Unauthorized")
                                        ? <>The current auth token (setup-token or API key) doesn&apos;t support querying usage limits. Usage data requires OAuth or a web session.</>
                                        : <>The current auth token doesn&apos;t include the <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">user:profile</code> scope needed for usage data.</>}
                                    </p>
                                    <p className="font-medium">To fix, try one of these:</p>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                      <li>Run <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">claude login</code> (full OAuth flow) for broader scopes including usage</li>
                                      <li>Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">CLAUDE_WEB_SESSION_KEY</code> — copy the sessionKey cookie from claude.ai</li>
                                      <li>Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">CLAUDE_WEB_COOKIE</code> — full cookie string from claude.ai</li>
                                    </ul>
                                    <p className="text-amber-500 dark:text-amber-500">Note: chat/completions still work fine — only usage limit visibility is affected.</p>
                                  </div>
                                )}
                              </div>
                            )
                          ) : windows && Array.isArray(windows) && windows.length > 0 ? (
                            <div className="mt-3 space-y-3">
                              {windows.map((w, widx) => {
                                const remaining = 100 - (w.usedPercent || 0);
                                return (
                                  <div key={widx}>
                                    <div className="flex items-center justify-between text-xs mb-1.5">
                                      <span className="font-medium text-strong">{w.label} window</span>
                                      <div className="flex items-center gap-2">
                                        <span className={cn(
                                          "font-medium",
                                          remaining > 50 ? "text-emerald-600 dark:text-emerald-400" :
                                          remaining > 20 ? "text-amber-600 dark:text-amber-400" :
                                          "text-rose-600 dark:text-rose-400",
                                        )}>{remaining}% remaining</span>
                                        {w.resetAt ? (
                                          <span className="text-muted flex items-center gap-1">
                                            <Clock className="h-3 w-3" />resets in {formatResetTime(w.resetAt)}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="h-2.5 w-full rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                                      <div
                                        className={cn(
                                          "h-full rounded-full transition-all duration-500",
                                          remaining > 50 ? "bg-emerald-500" : remaining > 20 ? "bg-amber-500" : "bg-rose-500",
                                        )}
                                        style={{ width: `${Math.max(0, Math.min(100, remaining))}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-muted">No usage windows available</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : providerUsage.raw ? (
                  <pre className="text-xs text-muted whitespace-pre-wrap font-mono overflow-x-auto">
                    {JSON.stringify(providerUsage.raw, null, 2)}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : providerLoading ? (
            <LoadingState size="sm" message="Loading provider usage limits…" />
          ) : null}

        </div>
      </main>
    </DashboardShell>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Clock,
  Cpu,
  RefreshCw,
  Zap,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
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
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { cn } from "@/lib/utils";

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

export default function UsagePage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 60_000,
    },
  });
  const boards = boardsQuery.data?.status === 200 ? boardsQuery.data.data?.items ?? [] : [];
  const firstBoardId = boards.length > 0 ? (boards[0] as unknown as Record<string, unknown>)?.id as string | undefined : undefined;

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 60_000,
    },
  });
  const agents = agentsQuery.data?.status === 200 ? agentsQuery.data.data?.items ?? [] : [];

  const statusQuery = useGatewaysStatusApiV1GatewaysStatusGet<
    gatewaysStatusApiV1GatewaysStatusGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
    },
  });
  const gatewayStatus = statusQuery.data?.status === 200 ? statusQuery.data.data : null;
  const sessions: SessionEntry[] = useMemo(() => {
    const raw = (gatewayStatus as Record<string, unknown> | null)?.sessions;
    return Array.isArray(raw) ? raw as SessionEntry[] : [];
  }, [gatewayStatus]);

  // Usage data
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Provider usage/quota data
  const [providerUsage, setProviderUsage] = useState<ProviderUsageData | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);

  // Daily cost data
  const [costData, setCostData] = useState<CostData | null>(null);

  const fetchUsage = async () => {
    if (!firstBoardId) return;
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await customFetch<{ data: UsageData; status: number }>(
        `/api/v1/gateways/usage?board_id=${firstBoardId}`,
        { method: "GET" },
      );
      if (res.status === 200) {
        setUsageData(res.data);
      } else {
        setUsageError("Failed to load usage data");
      }
    } catch {
      setUsageError("Failed to load usage data");
    } finally {
      setUsageLoading(false);
    }
  };

  const fetchCost = async () => {
    if (!firstBoardId) return;
    try {
      const res = await customFetch<{ data: CostData; status: number }>(
        `/api/v1/gateways/usage/cost?board_id=${firstBoardId}`,
        { method: "GET" },
      );
      if (res.status === 200) {
        setCostData(res.data);
      }
    } catch {
      // silent
    }
  };

  const fetchProviderUsage = async () => {
    if (!firstBoardId) return;
    setProviderLoading(true);
    try {
      const res = await customFetch<{ data: ProviderUsageData; status: number }>(
        `/api/v1/gateways/usage/providers?board_id=${firstBoardId}`,
        { method: "GET" },
      );
      if (res.status === 200) {
        setProviderUsage(res.data);
      }
    } catch {
      // silent — provider usage is supplemental
    } finally {
      setProviderLoading(false);
    }
  };

  useEffect(() => {
    if (firstBoardId && isSignedIn && isAdmin) {
      void fetchUsage();
      void fetchProviderUsage();
      void fetchCost();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstBoardId, isSignedIn, isAdmin]);

  // Aggregate session stats
  const sessionStats = useMemo(() => {
    const modelCounts: Record<string, number> = {};
    let totalSessions = sessions.length;
    let activeSessions = 0;
    const now = Date.now();

    for (const s of sessions) {
      const model = (s.model as string) || "default";
      modelCounts[model] = (modelCounts[model] || 0) + 1;
      const updated = s.updatedAtMs as number | undefined;
      if (updated && now - updated < 30 * 60 * 1000) {
        activeSessions++;
      }
    }

    return { totalSessions, activeSessions, modelCounts };
  }, [sessions]);

  // Aggregate usage stats from sessions.usage rich data
  const usageStats = useMemo(() => {
    if (!usageData?.usage?.length) return null;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalRuns = 0;
    let totalCost = 0;
    let totalMessages = 0;
    let totalToolCalls = 0;
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

      // Aggregate by model
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

  // Build per-agent table from sessions
  const agentRows = useMemo(() => {
    const agentMap = new Map<string, {
      name: string;
      model: string;
      status: string;
      lastSeen: string;
      sessionKey: string;
      statsLine: string;
    }>();

    for (const agent of agents) {
      const a = agent as unknown as Record<string, unknown>;
      const id = a.id as string;
      const name = a.name as string || id;
      const model = a.preferred_model as string || "default";
      const agentStatus = a.status as string || "unknown";
      const lastSeen = a.last_seen_at as string || "";
      const sessionId = a.openclaw_session_id as string || "";

      // Find matching session
      const session = sessions.find(s => s.key === sessionId);

      agentMap.set(id, {
        name,
        model: session?.model as string || model,
        status: agentStatus,
        lastSeen: lastSeen ? new Date(lastSeen).toLocaleString() : "—",
        sessionKey: sessionId,
        statsLine: session?.statsLine as string || "",
      });
    }

    return Array.from(agentMap.values());
  }, [agents, sessions]);

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

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-strong">AI Usage</h1>
            <p className="text-sm text-muted mt-1">
              Monitor token usage, model activity, and rate limit status across agents.
            </p>
          </div>
          <button
            onClick={() => { void fetchUsage(); void fetchProviderUsage(); void fetchCost(); }}
            disabled={usageLoading || providerLoading}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm text-strong transition",
              "hover:bg-[color:var(--surface-strong)]",
              usageLoading && "opacity-50 cursor-not-allowed",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", (usageLoading || providerLoading) && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Bot className="h-4 w-4" />
              Active Sessions
            </div>
            <p className="mt-2 text-2xl font-bold text-strong">
              {sessionStats.activeSessions}
              <span className="text-sm font-normal text-muted ml-1">
                / {sessionStats.totalSessions}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Zap className="h-4 w-4" />
              Models in Use
            </div>
            <p className="mt-2 text-2xl font-bold text-strong">
              {Object.keys(sessionStats.modelCounts).length}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(sessionStats.modelCounts).slice(0, 3).map(([model, count]) => (
                <span
                  key={model}
                  className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs text-muted"
                >
                  {model.split("/").pop()} ({count})
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted">
              <BarChart3 className="h-4 w-4" />
              Total Tokens
            </div>
            <p className="mt-2 text-2xl font-bold text-strong">
              {usageStats ? formatTokens(usageStats.totalInput + usageStats.totalOutput) : "—"}
            </p>
            {usageStats ? (
              <p className="mt-1 text-xs text-muted">
                {formatTokens(usageStats.totalInput)} in · {formatTokens(usageStats.totalOutput)} out
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Cpu className="h-4 w-4" />
              Estimated Cost
            </div>
            <p className="mt-2 text-2xl font-bold text-strong">
              {usageStats?.totalCost ? `$${usageStats.totalCost.toFixed(2)}` : "—"}
            </p>
            {usageStats ? (
              <p className="mt-1 text-xs text-muted">
                {usageStats.totalRuns} runs · {usageStats.totalMessages} messages · {usageStats.totalToolCalls} tool calls
              </p>
            ) : null}
          </div>
        </div>

        {/* Provider Usage / Rate Limits */}
        {(providerUsage?.raw || providerUsage?.providers?.length) && !providerUsage?.error ? (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-strong">Provider Usage Limits</h2>
              <p className="text-xs text-muted mt-0.5">
                Live quota and rate limit status from AI providers
              </p>
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
                      if (hours > 0) return `${hours}h ${mins}m`;
                      return `${mins}m`;
                    };

                    return (
                      <div key={idx} className="rounded-lg border border-[color:var(--border)] p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-strong">{displayName}</p>
                          {plan ? (
                            <span className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs text-muted">
                              {plan}
                            </span>
                          ) : null}
                        </div>
                        {error ? (
                          error.includes("429") || error.includes("Rate limited") ? (
                          <div className="mt-3 space-y-3">
                            <div className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 dark:bg-rose-950">
                              <Zap className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                                Usage cap likely exhausted — provider returning rate limit (429)
                              </p>
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
                                  : error}
                              </p>
                            </div>
                            {error.includes("user:profile") ? (
                              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 space-y-1">
                                <p>The current auth token doesn&apos;t include the <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">user:profile</code> scope needed for usage data.</p>
                                <p className="font-medium">To fix, set one of these in your gateway config:</p>
                                <ul className="list-disc pl-4 space-y-0.5">
                                  <li><code className="rounded bg-amber-100 px-1 dark:bg-amber-900">CLAUDE_WEB_SESSION_KEY</code> — copy the sessionKey cookie from claude.ai</li>
                                  <li><code className="rounded bg-amber-100 px-1 dark:bg-amber-900">CLAUDE_WEB_COOKIE</code> — full cookie string from claude.ai</li>
                                </ul>
                                <p className="text-amber-500 dark:text-amber-500">Or run <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">claude login</code> (full OAuth, not setup-token) for broader scopes.</p>
                              </div>
                            ) : null}
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
                                      )}>
                                        {remaining}% remaining
                                      </span>
                                      {w.resetAt ? (
                                        <span className="text-muted flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          resets in {formatResetTime(w.resetAt)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="h-2.5 w-full rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all duration-500",
                                        remaining > 50 ? "bg-emerald-500" :
                                        remaining > 20 ? "bg-amber-500" :
                                        "bg-rose-500",
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
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm">
            <p className="text-sm text-muted animate-pulse">Loading provider usage limits…</p>
          </div>
        ) : null}

        {/* Daily Cost Breakdown */}
        {costData?.daily && costData.daily.length > 0 && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-strong">Daily Cost & Token Usage</h2>
                  <p className="text-xs text-muted mt-0.5">
                    {costData.days ? `Last ${costData.days} days` : "Recent usage"}{costData.totals?.totalCost ? ` · Total: $${costData.totals.totalCost.toFixed(2)}` : ""}
                  </p>
                </div>
                {costData.totals ? (
                  <div className="text-right">
                    <p className="text-lg font-bold text-strong">${costData.totals.totalCost?.toFixed(2) ?? "0.00"}</p>
                    <p className="text-xs text-muted">{formatTokens(costData.totals.totalTokens || 0)} tokens</p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-muted">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Input</th>
                    <th className="px-4 py-3 font-medium text-right">Output</th>
                    <th className="px-4 py-3 font-medium text-right">Cache Read</th>
                    <th className="px-4 py-3 font-medium text-right">Total Tokens</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[...costData.daily].reverse().map((day) => (
                    <tr
                      key={day.date}
                      className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                    >
                      <td className="px-4 py-3 font-medium text-strong">{day.date || "—"}</td>
                      <td className="px-4 py-3 text-right text-muted">{formatTokens(day.input || 0)}</td>
                      <td className="px-4 py-3 text-right text-muted">{formatTokens(day.output || 0)}</td>
                      <td className="px-4 py-3 text-right text-muted">{formatTokens(day.cacheRead || 0)}</td>
                      <td className="px-4 py-3 text-right font-medium text-strong">{formatTokens(day.totalTokens || 0)}</td>
                      <td className="px-4 py-3 text-right font-medium text-strong">
                        {day.totalCost ? `$${day.totalCost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error state */}
        {(usageError || usageData?.error) && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {usageError || usageData?.error}
            </p>
          </div>
        )}

        {/* Per-Agent Table */}
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-strong">Agent Sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-left text-muted">
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last Seen</th>
                  <th className="px-4 py-3 font-medium">Usage</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      No agents found.
                    </td>
                  </tr>
                ) : (
                  agentRows.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                    >
                      <td className="px-4 py-3 font-medium text-strong">{row.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs">
                          {row.model}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          row.status === "online" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
                          row.status === "offline" && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                          !["online", "offline"].includes(row.status) && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
                        )}>
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            row.status === "online" && "bg-emerald-500",
                            row.status === "offline" && "bg-gray-400",
                            !["online", "offline"].includes(row.status) && "bg-amber-500",
                          )} />
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {row.lastSeen}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        {row.statsLine || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Model Breakdown */}
        {usageStats && Object.keys(usageStats.byModel).length > 0 && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-strong">Usage by Model</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-muted">
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium text-right">Input</th>
                    <th className="px-4 py-3 font-medium text-right">Output</th>
                    <th className="px-4 py-3 font-medium text-right">Cache Read</th>
                    <th className="px-4 py-3 font-medium text-right">Runs</th>
                    <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usageStats.byModel)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([model, data]) => (
                      <tr
                        key={model}
                        className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                      >
                        <td className="px-4 py-3 font-medium text-strong">{model}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatTokens(data.input)}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatTokens(data.output)}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatTokens(data.cacheRead)}</td>
                        <td className="px-4 py-3 text-right text-muted">{data.runs}</td>
                        <td className="px-4 py-3 text-right font-medium text-strong">
                          {data.cost > 0 ? `$${data.cost.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-Agent Usage Details */}
        {usageData?.usage && usageData.usage.length > 0 && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-strong">Per-Agent Usage</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-muted">
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium text-right">Input</th>
                    <th className="px-4 py-3 font-medium text-right">Output</th>
                    <th className="px-4 py-3 font-medium text-right">Cache Read</th>
                    <th className="px-4 py-3 font-medium text-right">Total Tokens</th>
                    <th className="px-4 py-3 font-medium text-right">Messages</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.usage
                    .filter(e => e.usage && (e.usage.totalTokens || 0) > 0)
                    .sort((a, b) => (b.usage?.totalCost || 0) - (a.usage?.totalCost || 0))
                    .map((entry, idx) => (
                    <tr
                      key={entry.key || idx}
                      className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                    >
                      <td className="px-4 py-3 font-medium text-strong">
                        {entry.label || entry.agentId || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-[color:var(--surface-strong)] px-2 py-0.5 text-xs">
                          {entry.modelProvider ? `${entry.modelProvider}/` : ""}{entry.model || "default"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatTokens(entry.usage?.input || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatTokens(entry.usage?.output || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatTokens(entry.usage?.cacheRead || 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-strong">
                        {formatTokens(entry.usage?.totalTokens || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {entry.usage?.messageCounts?.assistant || 0}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-strong">
                        {entry.usage?.totalCost ? `$${entry.usage.totalCost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

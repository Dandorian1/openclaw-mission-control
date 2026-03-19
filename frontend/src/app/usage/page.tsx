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

interface UsageEntry {
  date?: string;
  key?: string;
  label?: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  runs?: number;
  cost?: number;
  [k: string]: unknown;
}

interface UsageData {
  usage: UsageEntry[];
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

export default function UsagePage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
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
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 60_000,
    },
  });
  const agents = agentsQuery.data?.status === 200 ? agentsQuery.data.data?.items ?? [] : [];

  const statusQuery = useGatewaysStatusApiV1GatewaysStatusGet<
    gatewaysStatusApiV1GatewaysStatusGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
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

  // Aggregate usage stats
  const usageStats = useMemo(() => {
    if (!usageData?.usage?.length) return null;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalRuns = 0;
    let totalCost = 0;
    const byModel: Record<string, { input: number; output: number; runs: number; cost: number }> = {};

    for (const entry of usageData.usage) {
      const input = entry.inputTokens || 0;
      const output = entry.outputTokens || 0;
      const cacheRead = entry.cacheReadTokens || 0;
      const runs = entry.runs || 0;
      const cost = entry.cost || 0;
      totalInput += input;
      totalOutput += output;
      totalCacheRead += cacheRead;
      totalRuns += runs;
      totalCost += cost;

      const model = entry.model || entry.provider || "unknown";
      if (!byModel[model]) byModel[model] = { input: 0, output: 0, runs: 0, cost: 0 };
      byModel[model].input += input;
      byModel[model].output += output;
      byModel[model].runs += runs;
      byModel[model].cost += cost;
    }

    return { totalInput, totalOutput, totalCacheRead, totalRuns, totalCost, byModel };
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
            onClick={() => { void fetchUsage(); void fetchProviderUsage(); }}
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
              Agent Runs
            </div>
            <p className="mt-2 text-2xl font-bold text-strong">
              {usageStats ? usageStats.totalRuns : "—"}
            </p>
            {usageStats?.totalCost ? (
              <p className="mt-1 text-xs text-muted">
                Est. ${usageStats.totalCost.toFixed(2)}
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
                    const name = (provider.name || provider.provider || provider.id || `Provider ${idx + 1}`) as string;
                    const entries = (provider.entries || provider.windows || provider.limits) as Record<string, unknown>[] | undefined;
                    const text = provider.text as string | undefined;
                    const error = provider.error as string | undefined;
                    return (
                      <div key={idx} className="rounded-lg border border-[color:var(--border)] p-3">
                        <p className="text-sm font-medium text-strong">{name}</p>
                        {error ? (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{error}</p>
                        ) : text ? (
                          <p className="mt-1 text-xs text-muted whitespace-pre-wrap font-mono">{text}</p>
                        ) : entries && Array.isArray(entries) ? (
                          <div className="mt-2 space-y-1">
                            {entries.map((entry, eidx) => {
                              const label = (entry.label || entry.window || entry.name || `Window ${eidx + 1}`) as string;
                              const pct = entry.percentLeft as number | undefined;
                              const resets = entry.resetsIn as string | undefined;
                              return (
                                <div key={eidx} className="flex items-center justify-between text-xs">
                                  <span className="text-muted">{label}</span>
                                  <div className="flex items-center gap-2">
                                    {pct !== undefined ? (
                                      <>
                                        <div className="h-2 w-20 rounded-full bg-[color:var(--surface-strong)] overflow-hidden">
                                          <div
                                            className={cn(
                                              "h-full rounded-full transition-all",
                                              pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-rose-500",
                                            )}
                                            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                          />
                                        </div>
                                        <span className="text-muted w-12 text-right">{pct}%</span>
                                      </>
                                    ) : null}
                                    {resets ? (
                                      <span className="text-muted">resets {resets}</span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <pre className="mt-1 text-xs text-muted whitespace-pre-wrap font-mono overflow-x-auto">
                            {JSON.stringify(provider, null, 2)}
                          </pre>
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
                    <th className="px-4 py-3 font-medium text-right">Input Tokens</th>
                    <th className="px-4 py-3 font-medium text-right">Output Tokens</th>
                    <th className="px-4 py-3 font-medium text-right">Runs</th>
                    <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usageStats.byModel)
                    .sort(([, a], [, b]) => (b.input + b.output) - (a.input + a.output))
                    .map(([model, data]) => (
                      <tr
                        key={model}
                        className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                      >
                        <td className="px-4 py-3 font-medium text-strong">{model}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatTokens(data.input)}</td>
                        <td className="px-4 py-3 text-right text-muted">{formatTokens(data.output)}</td>
                        <td className="px-4 py-3 text-right text-muted">{data.runs}</td>
                        <td className="px-4 py-3 text-right text-muted">
                          {data.cost > 0 ? `$${data.cost.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Raw Usage Data */}
        {usageData?.usage && usageData.usage.length > 0 && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-strong">Session Usage Details</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-muted">
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Input</th>
                    <th className="px-4 py-3 font-medium text-right">Output</th>
                    <th className="px-4 py-3 font-medium text-right">Cache</th>
                    <th className="px-4 py-3 font-medium text-right">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.usage.slice(0, 50).map((entry, idx) => (
                    <tr
                      key={`${entry.key || ""}-${entry.date || idx}`}
                      className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-strong)] transition"
                    >
                      <td className="px-4 py-3 text-strong text-xs font-mono">
                        {entry.label || entry.key || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">{entry.date || "—"}</td>
                      <td className="px-4 py-3 text-right text-muted">
                        {entry.inputTokens ? formatTokens(entry.inputTokens) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {entry.outputTokens ? formatTokens(entry.outputTokens) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {entry.cacheReadTokens ? formatTokens(entry.cacheReadTokens) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {entry.runs || "—"}
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

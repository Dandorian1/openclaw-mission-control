"use client";

export const dynamic = "force-dynamic";

import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChevronDown,
  Info,
  LayoutGrid,
  Shield,
  Timer,
} from "lucide-react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { LoadingState } from "@/components/ui/loading-state";
import { ApiError } from "@/api/mutator";
import {
  type dashboardMetricsApiV1MetricsDashboardGetResponse,
  useDashboardMetricsApiV1MetricsDashboardGet,
} from "@/api/generated/metrics/metrics";
import {
  gatewaysStatusApiV1GatewaysStatusGet,
} from "@/api/generated/gateways/gateways";
import type { GatewaysStatusResponse } from "@/api/generated/model/gatewaysStatusResponse";
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
import type { ActivityEventRead } from "@/api/generated/model";
import {
  formatRelativeTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "@/lib/formatters";
import { resolveSessionModelDisplay } from "@/lib/session-model";

type SessionSummary = {
  key: string;
  title: string;
  subtitle: string;
  usage: string;
  lastSeenAt: string | null;
  isMain: boolean;
};

type SummaryRow = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
};

type GatewayTarget = {
  gatewayId: string;
  boardId: string;
  boardName: string;
};

type GatewaySnapshot = GatewayTarget & {
  connected: boolean;
  gatewayUrl: string | null;
  sessionsCount: number;
  sessions: unknown[];
  mainSession: unknown | null;
  mainSessionError: string | null;
  error: string | null;
  requestError: string | null;
};

const DASH = "—";
const DASHBOARD_RANGE = "7d";
const DASHBOARD_RANGE_DAYS = 7;
const DASHBOARD_RANGE_LABEL = "7 days";

const numberFormatter = new Intl.NumberFormat("en-US");
const SESSION_ID_KEYS = ["key", "id", "session_key", "sessionKey", "sessionId"];

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const readString = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readNumber = (
  record: Record<string, unknown> | null,
  keys: string[],
): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.-]/g, "");
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readStringFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readString(record, keys);
    if (value) return value;
  }
  return null;
};

const readNumberFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): number | null => {
  for (const record of records) {
    const value = readNumber(record, keys);
    if (value !== null) return value;
  }
  return null;
};

const normalizeEpochMs = (value: number): number => {
  if (value >= 1_000_000_000_000) return value;
  if (value >= 1_000_000_000) return value * 1000;
  return value;
};

const readTimestamp = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(normalizeEpochMs(value));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const numeric = Number.parseFloat(trimmed);
      if (Number.isFinite(numeric)) {
        const date = new Date(normalizeEpochMs(numeric));
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
      const parsed = parseTimestamp(trimmed);
      if (parsed) return parsed.toISOString();
    }
  }
  return null;
};

const readTimestampFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readTimestamp(record, keys);
    if (value) return value;
  }
  return null;
};

const sessionIdentifiers = (record: Record<string, unknown> | null): string[] => {
  if (!record) return [];
  const ids = SESSION_ID_KEYS.map((key) => readString(record, [key])).filter(Boolean) as string[];
  return [...new Set(ids)];
};

const sharesSessionIdentity = (left: string[], right: string[]): boolean =>
  left.some((value) => right.includes(value));

const compactNumber = (value: number): string => {
  if (!Number.isFinite(value)) return DASH;
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return numberFormatter.format(value);
};

const formatCount = (value: number): string =>
  Number.isFinite(value) ? numberFormatter.format(Math.max(0, Math.round(value))) : "0";

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : DASH;

const formatPerDay = (total: number, days: number): string => {
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) return DASH;
  return `${(total / days).toFixed(1)}/day`;
};

const toSessionSummaries = (
  sessions: unknown[] | null | undefined,
  mainSession: unknown,
): SessionSummary[] => {
  const sessionRecords = (sessions ?? []).map(toRecord).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const mainRecord = toRecord(mainSession);
  const mainIdentifiers = sessionIdentifiers(mainRecord);

  if (mainRecord && mainIdentifiers.length > 0) {
    const exists = sessionRecords.some(
      (entry) => sharesSessionIdentity(sessionIdentifiers(entry), mainIdentifiers),
    );
    if (!exists) sessionRecords.unshift(mainRecord);
  }

  const uniqueRecords: Record<string, unknown>[] = [];
  const seenIdentifiers = new Set<string>();

  for (const entry of sessionRecords) {
    const identifiers = sessionIdentifiers(entry);
    if (identifiers.length > 0 && identifiers.some((value) => seenIdentifiers.has(value))) {
      continue;
    }
    uniqueRecords.push(entry);
    identifiers.forEach((value) => seenIdentifiers.add(value));
  }

  return uniqueRecords.map((entry, index) => {
    const usageRecord = toRecord(entry.usage);
    const statsRecord = toRecord(entry.stats);
    const metricsRecord = toRecord(entry.metrics);
    const originRecord = toRecord(entry.origin);
    const candidateRecords = [entry, usageRecord, statsRecord, metricsRecord];

    const identifiers = sessionIdentifiers(entry);
    const key =
      readString(entry, ["key", "session_key", "sessionKey", "id", "sessionId"]) ??
      `session-${index}`;
    const label = readString(entry, ["label", "name", "title"]) ?? key;
    const channel = readStringFromRecords([entry, originRecord], [
      "channel",
      "source",
      "kind",
      "chatType",
    ]);
    const model = resolveSessionModelDisplay({
      model: readString(entry, ["model"]),
      model_name: readString(entry, ["model_name"]),
      modelOverride: readString(entry, ["modelOverride"]),
      model_override: readString(entry, ["model_override"]),
      modelId: readString(entry, ["modelId"]),
      model_id: readString(entry, ["model_id"]),
      modelProvider: readString(entry, ["modelProvider"]),
      model_provider: readString(entry, ["model_provider"]),
      provider: readString(entry, ["provider"]),
      providerOverride: readString(entry, ["providerOverride"]),
      provider_override: readString(entry, ["provider_override"]),
    });
    const lastSeenAt = readTimestampFromRecords(candidateRecords, [
      "updated_at",
      "updatedAt",
      "last_updated_at",
      "lastUpdatedAt",
      "last_seen_at",
      "lastSeen",
      "last_seen",
      "last_active_at",
      "lastActiveAt",
      "lastActivityAt",
      "activityAt",
      "created_at",
      "createdAt",
    ]);

    const usedTokens = readNumberFromRecords(candidateRecords, [
      "used",
      "used_tokens",
      "tokens",
      "current",
      "token_count",
      "tokenCount",
      "totalTokens",
      "total_tokens",
      "inputTokens",
      "input_tokens",
    ]);
    const maxTokens = readNumberFromRecords(candidateRecords, [
      "max",
      "limit",
      "token_limit",
      "capacity",
      "max_tokens",
      "maxTokens",
      "context_window",
      "contextWindow",
      "contextTokens",
      "context_tokens",
      "maxContextTokens",
      "max_context_tokens",
    ]);

    const pctFromPayload = readNumberFromRecords(candidateRecords, [
      "pct",
      "percent",
      "ratio_pct",
      "ratioPct",
      "token_pct",
      "usage_pct",
      "percentUsed",
      "contextPercent",
    ]);
    const usagePct = Number.isFinite(pctFromPayload ?? NaN)
      ? Math.max(0, Math.min(100, Math.round(pctFromPayload ?? 0)))
      : usedTokens !== null && maxTokens !== null && maxTokens > 0
        ? Math.max(0, Math.min(100, Math.round((usedTokens / maxTokens) * 100)))
        : 0;

    const usage =
      usedTokens !== null && maxTokens !== null
        ? `${compactNumber(usedTokens)}/${compactNumber(maxTokens)} (${usagePct}%)`
        : usedTokens !== null
          ? `${compactNumber(usedTokens)} tokens`
          : DASH;

    const subtitleBits = [channel, model].filter(Boolean) as string[];
    const subtitle = subtitleBits.length > 0 ? subtitleBits.join(" · ") : "Session";

    return {
      key,
      title: label,
      subtitle,
      usage,
      lastSeenAt,
      isMain:
        mainIdentifiers.length > 0 &&
        sharesSessionIdentity(identifiers, mainIdentifiers),
    };
  });
};

function PendingApprovalsSkeleton() {
  const timeoutMs = 10_000;
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimedOut(false);
    timerRef.current = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [retryKey]);

  if (timedOut) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm text-muted">
        <p>Could not load approvals.</p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-1 text-[color:var(--accent)] underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-1 py-0.5" aria-label="Loading pending approvals" aria-busy>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-4 animate-progress-shimmer rounded bg-[color:var(--surface-strong)]"
          style={{ width: i === 2 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

function TopMetricCard({
  title,
  value,
  secondary,
  icon,
}: {
  title: string;
  value: string;
  secondary?: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {title}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <p className="font-heading text-4xl font-bold text-strong">{value}</p>
            {secondary ? (
              <p className="pb-1 text-xs text-muted">{secondary}</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--accent-soft)] p-2 text-[color:var(--accent)]">
          {icon}
        </div>
      </div>
    </section>
  );
}

function InfoBlock({
  title,
  badge,
  infoText,
  rows,
}: {
  title: string;
  badge?: { text: string; tone: "online" | "offline" | "neutral" };
  infoText?: string;
  rows: SummaryRow[];
}) {
  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-strong">{title}</h3>
          {infoText ? (
            <span
              className="inline-flex text-quiet"
              title={infoText}
              aria-label={infoText}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              badge.tone === "online"
                ? "bg-emerald-100 text-emerald-700"
                : badge.tone === "offline"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-200 text-strong dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {badge.text}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="min-w-0 text-sm text-muted">{row.label}</span>
            <span
              className={`max-w-[65%] break-words text-right text-sm font-medium leading-5 ${
                row.tone === "success"
                  ? "text-emerald-700"
                  : row.tone === "warning"
                    ? "text-amber-700"
                    : row.tone === "danger"
                      ? "text-rose-700"
                      : "text-slate-800"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const GATEWAY_CARD_STORAGE_KEY = "dashboard-gateway-card-expanded";

function GatewayHealthCard({
  statusLabel,
  badgeTone,
  rows,
}: {
  statusLabel: string;
  badgeTone: "online" | "offline" | "neutral";
  rows: SummaryRow[];
}) {
  const isConnected = badgeTone === "online";

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return !isConnected;
    try {
      const stored = window.localStorage.getItem(GATEWAY_CARD_STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch {
      // localStorage unavailable
    }
    return !isConnected;
  });

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(GATEWAY_CARD_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const badgeClass =
    badgeTone === "online"
      ? "bg-emerald-100 text-emerald-700"
      : badgeTone === "offline"
        ? "bg-rose-100 text-rose-700"
        : "bg-[color:var(--surface-strong)] text-strong";

  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 transition hover:bg-[color:var(--surface-muted)] md:px-6"
        aria-expanded={expanded}
        aria-controls="gateway-health-details"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-strong">Gateway Health</h3>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
            {statusLabel}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-quiet transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded ? (
        <div id="gateway-health-details" className="px-4 pb-4 md:px-6 md:pb-6">
          <div className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
            {rows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-sm text-muted">{row.label}</span>
                <span
                  className={`max-w-[65%] break-words text-right text-sm font-medium leading-5 ${
                    row.tone === "success"
                      ? "text-emerald-700"
                      : row.tone === "warning"
                        ? "text-amber-700"
                        : row.tone === "danger"
                          ? "text-rose-700"
                          : "text-strong"
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    },
  );

  const agentsQuery = useListAgentsApiV1AgentsGet<listAgentsApiV1AgentsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const metricsQuery = useDashboardMetricsApiV1MetricsDashboardGet<
    dashboardMetricsApiV1MetricsDashboardGetResponse,
    ApiError
  >(
    {
      range_key: DASHBOARD_RANGE,
    },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      },
    },
  );

  const activityQuery = useListActivityApiV1ActivityGet<listActivityApiV1ActivityGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? [...(boardsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [boardsQuery.data],
  );

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? [...(agentsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [agentsQuery.data],
  );

  const metrics = metricsQuery.data?.status === 200 ? metricsQuery.data.data : null;

  const onlineAgents = useMemo(
    () => agents.filter((agent) => (agent.status ?? "").toLowerCase() === "online").length,
    [agents],
  );
  const gatewayTargets = useMemo<GatewayTarget[]>(() => {
    const byGateway = new Map<string, GatewayTarget>();
    for (const board of boards) {
      const gatewayId = board.gateway_id;
      if (!gatewayId) continue;
      if (byGateway.has(gatewayId)) continue;
      byGateway.set(gatewayId, {
        gatewayId,
        boardId: board.id,
        boardName: board.name,
      });
    }
    return [...byGateway.values()].sort((a, b) => a.boardName.localeCompare(b.boardName));
  }, [boards]);
  const hasConfiguredGateways = gatewayTargets.length > 0;

  const gatewayStatusesQuery = useQuery<GatewaySnapshot[], ApiError>({
    queryKey: [
      "dashboard",
      "gateway-statuses",
      gatewayTargets.map((target) => `${target.gatewayId}:${target.boardId}`),
    ],
    enabled: Boolean(isSignedIn && hasConfiguredGateways),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      return Promise.all(
        gatewayTargets.map(async (target): Promise<GatewaySnapshot> => {
          try {
            const response = await gatewaysStatusApiV1GatewaysStatusGet(
              { board_id: target.boardId },
              { signal },
            );
            if (response.status !== 200) {
              return {
                ...target,
                connected: false,
                gatewayUrl: null,
                sessionsCount: 0,
                sessions: [],
                mainSession: null,
                mainSessionError: null,
                error: null,
                requestError: `Gateway status request failed (${response.status})`,
              };
            }
            const payload: GatewaysStatusResponse = response.data;
            return {
              ...target,
              connected: Boolean(payload.connected),
              gatewayUrl: payload.gateway_url ?? null,
              sessionsCount: Number(payload.sessions_count ?? 0),
              sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
              mainSession: payload.main_session ?? null,
              mainSessionError: payload.main_session_error ?? null,
              error: payload.error ?? null,
              requestError: null,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              ...target,
              connected: false,
              gatewayUrl: null,
              sessionsCount: 0,
              sessions: [],
              mainSession: null,
              mainSessionError: null,
              error: null,
              requestError:
                error instanceof Error ? error.message : "Gateway status request failed.",
            };
          }
        }),
      );
    },
  });

  const gatewaySnapshots = useMemo(
    () => gatewayStatusesQuery.data ?? [],
    [gatewayStatusesQuery.data],
  );
  const sessionSummaries = useMemo(
    () =>
      gatewaySnapshots.flatMap((snapshot) => {
        if (snapshot.requestError) return [];
        const sourceLabel = snapshot.gatewayUrl || snapshot.boardName;
        return toSessionSummaries(snapshot.sessions, snapshot.mainSession).map((session) => ({
          ...session,
          key: `${snapshot.gatewayId}:${session.key}`,
          subtitle: `${sourceLabel} · ${session.subtitle}`,
        }));
      }),
    [gatewaySnapshots],
  );

  const activityEvents = useMemo(
    () =>
      activityQuery.data?.status === 200
        ? [...(activityQuery.data.data.items ?? [])]
        : [],
    [activityQuery.data],
  );

  const orderedActivityEvents = useMemo(
    () =>
      [...activityEvents].sort((a, b) => {
        const left = parseTimestamp(a.created_at)?.getTime() ?? 0;
        const right = parseTimestamp(b.created_at)?.getTime() ?? 0;
        return right - left;
      }),
    [activityEvents],
  );

  const recentLogs = orderedActivityEvents.slice(0, 8);

  const latestThroughputPoint =
    metrics?.throughput.primary.points?.[metrics.throughput.primary.points.length - 1] ?? null;
  const throughputTotal = (metrics?.throughput.primary.points ?? []).reduce(
    (sum, point) => sum + Number(point.value ?? 0),
    0,
  );
  const completionDaysCount = (metrics?.throughput.primary.points ?? []).reduce(
    (sum, point) => sum + (Number(point.value ?? 0) > 0 ? 1 : 0),
    0,
  );

  const inboxTasksMetric = metrics?.kpis.inbox_tasks ?? 0;
  const inProgressTasksMetric = metrics?.kpis.in_progress_tasks ?? 0;
  const reviewTasksMetric = metrics?.kpis.review_tasks ?? 0;
  const doneTasksMetric = metrics?.kpis.done_tasks ?? 0;
  const wontDoTasksMetric = metrics?.kpis.wont_do_tasks ?? 0;

  const activeAgentsMetric = onlineAgents;
  const tasksTotal = inboxTasksMetric + inProgressTasksMetric + reviewTasksMetric + doneTasksMetric + wontDoTasksMetric;
  const tasksInProgressMetric = metrics?.kpis.tasks_in_progress ?? inProgressTasksMetric;
  const errorRateMetric = Number(metrics?.kpis.error_rate_pct ?? 0);
  const reviewBacklogRatio =
    inProgressTasksMetric > 0 ? reviewTasksMetric / inProgressTasksMetric : null;

  const gatewayConnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && snapshot.connected,
  ).length;
  const gatewayDisconnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && !snapshot.connected,
  ).length;
  const gatewayUnavailableCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.requestError),
  ).length;
  const gatewayHealthErrorCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.error || snapshot.mainSessionError),
  ).length;

  const countedSessions = gatewaySnapshots.reduce(
    (sum, snapshot) => sum + Math.max(0, snapshot.sessionsCount),
    0,
  );
  const activeSessions = Math.max(countedSessions, sessionSummaries.length);

  const gatewayStatusLabel = !hasConfiguredGateways
    ? "Not configured"
    : gatewayStatusesQuery.isLoading
      ? "Checking"
      : gatewayConnectedCount === gatewayTargets.length
        ? "All connected"
        : gatewayConnectedCount > 0
          ? "Partially connected"
          : gatewayUnavailableCount === gatewayTargets.length
            ? "Unavailable"
            : "Disconnected";
  const gatewayBadgeTone: "online" | "offline" | "neutral" =
    gatewayStatusLabel === "All connected"
      ? "online"
      : gatewayStatusLabel === "Partially connected" ||
          gatewayStatusLabel === "Disconnected" ||
          gatewayStatusLabel === "Unavailable"
        ? "offline"
        : "neutral";
  const gatewayStatusTone: SummaryRow["tone"] =
    gatewayStatusLabel === "All connected"
      ? "success"
      : gatewayStatusLabel === "Checking" || gatewayStatusLabel === "Not configured"
        ? "default"
        : gatewayStatusLabel === "Partially connected" || gatewayStatusLabel === "Disconnected"
          ? "warning"
          : "danger";

  const workloadRows: SummaryRow[] = [
    {
      label: "Total work items",
      value: formatCount(tasksTotal),
    },
    {
      label: "Inbox",
      value: formatCount(inboxTasksMetric),
    },
    {
      label: "In progress",
      value: formatCount(inProgressTasksMetric),
      tone: inProgressTasksMetric > 0 ? "warning" : "default",
    },
    {
      label: "In review",
      value: formatCount(reviewTasksMetric),
    },
    {
      label: "Completed",
      value: formatCount(doneTasksMetric),
      tone: doneTasksMetric > 0 ? "success" : "default",
    },
  ];

  const throughputRows: SummaryRow[] = [
    {
      label: "Completed tasks",
      value: formatCount(throughputTotal),
    },
    { label: "Average throughput", value: formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS) },
    {
      label: "Error rate",
      value: formatPercent(errorRateMetric),
      tone: errorRateMetric > 0 ? "warning" : "success",
    },
    {
      label: "Completion consistency",
      value: `${formatCount(completionDaysCount)} active days`,
      tone: completionDaysCount >= Math.ceil(DASHBOARD_RANGE_DAYS * 0.75) ? "success" : "default",
    },
    {
      label: "Review backlog ratio",
      value:
        reviewBacklogRatio !== null
          ? `${reviewBacklogRatio.toFixed(2)}x`
          : reviewTasksMetric > 0
            ? "∞"
            : "0.00x",
      tone:
        reviewBacklogRatio !== null
          ? reviewBacklogRatio > 1
            ? "warning"
            : "success"
          : reviewTasksMetric > 0
            ? "warning"
            : "success",
    },
  ];

  const gatewayRows: SummaryRow[] = [
    { label: "Gateway status", value: gatewayStatusLabel, tone: gatewayStatusTone },
    { label: "Configured gateways", value: formatCount(gatewayTargets.length) },
    {
      label: "Connected gateways",
      value: formatCount(gatewayConnectedCount),
      tone: gatewayConnectedCount > 0 ? "success" : "default",
    },
    {
      label: "Unavailable gateways",
      value: formatCount(gatewayUnavailableCount),
      tone: gatewayUnavailableCount > 0 ? "danger" : "default",
    },
    {
      label: "Gateways with issues",
      value: formatCount(gatewayHealthErrorCount + gatewayDisconnectedCount),
      tone: gatewayHealthErrorCount + gatewayDisconnectedCount > 0 ? "warning" : "success",
    },
  ];
  const pendingApprovalItems = metrics?.pending_approvals.items ?? [];
  const pendingApprovalsTotal = metrics?.pending_approvals.total ?? 0;
  const hasPendingApprovals = pendingApprovalItems.length > 0;
  const activityFeedHref = "/activity";

  const shouldIgnoreRowNavigation = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("a"));
  };

  const buildActivityEventHref = (event: ActivityEventRead): string => {
    const routeName = event.route_name ?? null;
    const routeParams = event.route_params ?? {};

    if (routeName === "board.approvals") {
      const boardId = routeParams.boardId;
      if (boardId) {
        return `/boards/${encodeURIComponent(boardId)}/approvals`;
      }
    }

    if (routeName === "board") {
      const boardId = routeParams.boardId;
      if (boardId) {
        const params = new URLSearchParams();
        Object.entries(routeParams).forEach(([key, value]) => {
          if (key !== "boardId") params.set(key, value);
        });
        const query = params.toString();
        return query
          ? `/boards/${encodeURIComponent(boardId)}?${query}`
          : `/boards/${encodeURIComponent(boardId)}`;
      }
    }

    const params = new URLSearchParams(
      Object.keys(routeParams).length > 0
        ? routeParams
        : {
            eventId: event.id,
            eventType: event.event_type,
            createdAt: event.created_at,
          },
    );
    if (event.task_id && !params.has("taskId")) {
      params.set("taskId", event.task_id);
    }
    return `${activityFeedHref}?${params.toString()}`;
  };

  const navigateToActivityFeed = (href: string) => {
    router.push(href);
  };

  const handleLogRowClick = (
    event: MouseEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (shouldIgnoreRowNavigation(event.target)) return;
    navigateToActivityFeed(href);
  };

  const handleLogRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (shouldIgnoreRowNavigation(event.target)) return;
    event.preventDefault();
    navigateToActivityFeed(href);
  };

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the dashboard."
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        />
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-app">
          <div className="p-4 md:p-8">
            {/* Hero Header */}
            <div className="mb-6 rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-8 py-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-strong md:text-3xl">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-muted">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}{" "}
                &middot;{" "}
                {new Date().toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>
            </div>
            {metricsQuery.error ? (
              <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                Load failed: {metricsQuery.error.message}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TopMetricCard
                title="Agents"
                value={formatCount(agents.length)}
                secondary={`${formatCount(activeAgentsMetric)} online`}
                icon={<Bot className="h-4 w-4" />}
              />
              <TopMetricCard
                title="Tasks"
                value={formatCount(throughputTotal)}
                secondary={formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS)}
                icon={<LayoutGrid className="h-4 w-4" />}
              />
              <TopMetricCard
                title="Boards"
                value={formatCount(boards.length)}
                secondary={`${formatCount(gatewayConnectedCount)} connected`}
                icon={<Activity className="h-4 w-4" />}
              />
              <TopMetricCard
                title="Approvals"
                value={formatCount(pendingApprovalsTotal)}
                secondary="pending"
                icon={<Shield className="h-4 w-4" />}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <InfoBlock
                title="Workload"
                rows={workloadRows}
              />
              <InfoBlock
                title="Throughput"
                rows={throughputRows}
              />
              <GatewayHealthCard
                statusLabel={gatewayStatusLabel}
                badgeTone={gatewayBadgeTone}
                rows={gatewayRows}
              />
            </div>

            <section className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-strong">Pending Approvals</h3>
                <Link
                  href="/approvals"
                  className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-strong"
                >
                  Open global approvals
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {!metrics && metricsQuery.isLoading ? (
                <PendingApprovalsSkeleton />
              ) : !metrics && metricsQuery.error ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                  Pending approvals are temporarily unavailable.
                </div>
              ) : hasPendingApprovals ? (
                <div className="space-y-2">
                  <div className="divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
                    {pendingApprovalItems.map((item) => (
                      <Link
                        key={item.approval_id}
                        href={`/boards/${item.board_id}/approvals`}
                        className="flex items-center justify-between gap-3 px-3 py-2 transition hover:bg-[color:var(--surface-muted)]"
                      >
                        <span className="min-w-0 text-sm text-muted">
                          <span className="block truncate font-medium text-strong">
                            {item.task_title || "Pending approval"}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {item.board_name} · {item.confidence}% score
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {formatRelativeTimestamp(item.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pendingApprovalsTotal > pendingApprovalItems.length ? (
                    <p className="text-xs text-muted">
                      Showing latest {formatCount(pendingApprovalItems.length)} of{" "}
                      {formatCount(pendingApprovalsTotal)} pending approvals.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  No pending approvals across your boards.
                </div>
              )}
            </section>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-strong">Sessions</h3>
                  <span className="text-xs text-muted">{formatCount(activeSessions)}</span>
                </div>
                <div className="max-h-[310px] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                  {!hasConfiguredGateways ? (
                    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm text-muted">
                      <p>No gateways are configured for any board yet.</p>
                      <Link
                        href="/gateways/new"
                        className="mt-2 inline-flex items-center gap-1 text-[color:var(--accent)] underline-offset-2 hover:underline"
                      >
                        Configure a gateway
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : gatewayStatusesQuery.isLoading ? (
                    <LoadingState size="sm" message="Loading sessions…" />
                  ) : sessionSummaries.length > 0 ? (
                    <>
                      {gatewayUnavailableCount > 0 ? (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                          {formatCount(gatewayUnavailableCount)} gateway
                          {gatewayUnavailableCount === 1 ? "" : "s"} unavailable; showing sessions
                          from reachable gateways.
                        </div>
                      ) : null}
                      {sessionSummaries.map((session) => (
                        <div
                          key={session.key}
                          className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-strong">
                                <span
                                  className={`mr-2 inline-block h-2 w-2 rounded-full ${
                                    session.isMain ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
                                  }`}
                                />
                                {session.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted">{session.subtitle}</p>
                            </div>
                            <div className="min-w-0 max-w-[45%] text-right">
                              <p className="truncate text-xs font-medium text-strong">
                                {session.usage === DASH ? "Usage unavailable" : session.usage}
                              </p>
                              <p className="text-[11px] text-muted">
                                {session.lastSeenAt
                                  ? formatRelativeTimestamp(session.lastSeenAt)
                                  : "Activity unavailable"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : gatewayUnavailableCount === gatewayTargets.length ? (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                      Session data is unavailable for all configured gateways.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm text-muted">
                      No active sessions detected.
                    </div>
                  )}
                </div>
              </section>

              <section className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-strong">Recent Activity</h3>
                  <Link
                    href={activityFeedHref}
                    className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-strong"
                  >
                    Open feed
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="max-h-[310px] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                  {recentLogs.length > 0 ? (
                    recentLogs.map((event) => {
                      const eventHref = buildActivityEventHref(event);
                      return (
                        <div
                          key={event.id}
                          role="link"
                          tabIndex={0}
                        aria-label={`Open related context for ${event.event_type} activity`}
                          onClick={(interactionEvent) =>
                            handleLogRowClick(interactionEvent, eventHref)
                          }
                          onKeyDown={(interactionEvent) =>
                            handleLogRowKeyDown(interactionEvent, eventHref)
                          }
                          className="cursor-pointer overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-muted)] focus-visible:border-[color:var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="break-words text-sm font-medium text-strong [&_ol]:mb-0 [&_p]:mb-0 [&_pre]:my-1 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:mb-0">
                                <Markdown
                                  content={event.message?.trim() || event.event_type}
                                  variant="comment"
                                />
                              </div>
                              <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">
                                {event.event_type}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-muted">
                              <p>{formatRelativeTimestamp(event.created_at)}</p>
                              <p>{formatTimestamp(event.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-[240px] flex-col items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-sm text-muted">
                      <Shield className="mb-2 h-5 w-5 text-quiet" />
                      No activity yet
                      <p className="mt-1 text-xs text-muted">Activity appears here when events are emitted.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}

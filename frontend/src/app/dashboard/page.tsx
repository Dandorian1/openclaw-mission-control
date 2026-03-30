"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity,
  Bot,
  LayoutGrid,
  Shield,
} from "lucide-react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
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
import { parseTimestamp } from "@/lib/formatters";
import { resolveSessionModelDisplay } from "@/lib/session-model";

import {
  HeroHeader,
  KpiTile,
  GatewayHealthSection,
  PendingApprovalsSection,
  RecentActivitySection,
} from "./components";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DASH = "—";
const DASHBOARD_RANGE = "7d";
const DASHBOARD_RANGE_DAYS = 7;

const numberFormatter = new Intl.NumberFormat("en-US");
const SESSION_ID_KEYS = ["key", "id", "session_key", "sessionKey", "sessionId"];

// ---------------------------------------------------------------------------
// Utility helpers (preserved from original)
// ---------------------------------------------------------------------------

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

    const tokensIn = readNumber(entry, [
      "tokens_in",
      "tokensIn",
      "input_tokens",
      "inputTokens",
      "promptTokens",
      "prompt_tokens",
    ]);
    const tokensOut = readNumber(entry, [
      "tokens_out",
      "tokensOut",
      "output_tokens",
      "outputTokens",
      "completionTokens",
      "completion_tokens",
    ]);
    const totalTokens = readNumber(entry, [
      "total_tokens",
      "totalTokens",
      "tokens",
    ]);

    const usageTokensIn =
      tokensIn ??
      readNumber(usageRecord, [
        "tokens_in",
        "tokensIn",
        "input_tokens",
        "inputTokens",
        "promptTokens",
        "prompt_tokens",
      ]);
    const usageTokensOut =
      tokensOut ??
      readNumber(usageRecord, [
        "tokens_out",
        "tokensOut",
        "output_tokens",
        "outputTokens",
        "completionTokens",
        "completion_tokens",
      ]);
    const usageTotalTokens =
      totalTokens ??
      readNumber(usageRecord, [
        "total_tokens",
        "totalTokens",
        "tokens",
      ]);

    const effectiveTotalTokens =
      usageTotalTokens ??
      ((usageTokensIn ?? 0) > 0 || (usageTokensOut ?? 0) > 0
        ? (usageTokensIn ?? 0) + (usageTokensOut ?? 0)
        : null);

    const usageParts: string[] = [];
    if (effectiveTotalTokens !== null && effectiveTotalTokens > 0) {
      const k = effectiveTotalTokens / 1000;
      usageParts.push(k >= 10 ? `${Math.round(k)}k tok` : `${k.toFixed(1)}k tok`);
    }

    const costValue = readNumber(entry, [
      "cost",
      "total_cost",
      "totalCost",
      "estimated_cost",
      "estimatedCost",
    ]);
    if (costValue !== null && costValue > 0) {
      usageParts.push(`$${costValue < 0.01 ? costValue.toFixed(4) : costValue.toFixed(2)}`);
    }

    const subtitle = [channel, model].filter(Boolean).join(" · ") || key;
    const usage = usageParts.length > 0 ? usageParts.join(" · ") : DASH;
    const isMain = mainIdentifiers.length > 0 && sharesSessionIdentity(sessionIdentifiers(entry), mainIdentifiers);

    return { key, title: label, subtitle, usage, lastSeenAt, isMain };
  });
};

// ---------------------------------------------------------------------------
// Activity event href builder
// ---------------------------------------------------------------------------

const buildActivityEventHref = (event: ActivityEventRead): string => {
  const routeName = event.route_name ?? null;
  const routeParams = event.route_params ?? {};

  if (routeName === "board.approvals") {
    const boardId = routeParams.boardId;
    if (boardId) return `/boards/${encodeURIComponent(boardId)}/approvals`;
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
  return `/activity?${params.toString()}`;
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { isSignedIn } = useAuth();

  // -------------------------------------------------------------------------
  // Data queries (all preserved from original)
  // -------------------------------------------------------------------------

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
    { range_key: DASHBOARD_RANGE },
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

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

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
      byGateway.set(gatewayId, { gatewayId, boardId: board.id, boardName: board.name });
    }
    return [...byGateway.values()].sort((a, b) => a.boardName.localeCompare(b.boardName));
  }, [boards]);

  const hasConfiguredGateways = gatewayTargets.length > 0;

  const gatewayStatusesQuery = useQuery<GatewaySnapshot[], ApiError>({
    queryKey: [
      "dashboard",
      "gateway-statuses",
      gatewayTargets.map((t) => `${t.gatewayId}:${t.boardId}`),
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

  const recentLogs = orderedActivityEvents.slice(0, 10);

  // -------------------------------------------------------------------------
  // Metrics computations
  // -------------------------------------------------------------------------

  const throughputTotal = (metrics?.throughput.primary.points ?? []).reduce(
    (sum, point) => sum + Number(point.value ?? 0),
    0,
  );

  const pendingApprovalsTotal = metrics?.pending_approvals.total ?? 0;
  const pendingApprovalItems = metrics?.pending_approvals.items ?? [];

  // Gateway health
  const gatewayConnectedCount = gatewaySnapshots.filter(
    (s) => !s.requestError && s.connected,
  ).length;
  const gatewayDisconnectedCount = gatewaySnapshots.filter(
    (s) => !s.requestError && !s.connected,
  ).length;
  const gatewayUnavailableCount = gatewaySnapshots.filter(
    (s) => Boolean(s.requestError),
  ).length;
  const gatewayHealthErrorCount = gatewaySnapshots.filter(
    (s) => Boolean(s.error || s.mainSessionError),
  ).length;

  const countedSessions = gatewaySnapshots.reduce(
    (sum, s) => sum + Math.max(0, s.sessionsCount),
    0,
  );

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

  const gatewayRows: SummaryRow[] = [
    { label: "Gateway status", value: gatewayStatusLabel, tone: gatewayStatusTone },
    { label: "Configured gateways", value: formatCount(gatewayTargets.length) },
    {
      label: "Connected gateways",
      value: formatCount(gatewayConnectedCount),
      tone: gatewayConnectedCount > 0 ? "success" : "default",
    },
    {
      label: "Active sessions",
      value: formatCount(countedSessions),
    },
    {
      label: "Gateways with issues",
      value: formatCount(gatewayHealthErrorCount + gatewayDisconnectedCount),
      tone: gatewayHealthErrorCount + gatewayDisconnectedCount > 0 ? "warning" : "success",
    },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
            <HeroHeader />

            {/* Error banner */}
            {metricsQuery.error ? (
              <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                Dashboard metrics failed to load: {metricsQuery.error.message}
                <button
                  type="button"
                  onClick={() => metricsQuery.refetch()}
                  className="ml-2 underline"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {/* KPI Metric Tiles — 4 columns desktop, 2 tablet, 1 mobile */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile
                label="Agents"
                value={formatCount(agents.length)}
                secondary={`${formatCount(onlineAgents)} online`}
                icon={<Bot className="h-5 w-5" />}
                href="/team"
              />
              <KpiTile
                label="Tasks"
                value={formatCount(throughputTotal)}
                secondary={formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS)}
                icon={<LayoutGrid className="h-5 w-5" />}
              />
              <KpiTile
                label="Boards"
                value={formatCount(boards.length)}
                secondary={`${formatCount(gatewayConnectedCount)} connected`}
                icon={<Activity className="h-5 w-5" />}
              />
              <KpiTile
                label="Approvals"
                value={formatCount(pendingApprovalsTotal)}
                secondary="pending"
                icon={<Shield className="h-5 w-5" />}
                href="/approvals"
              />
            </div>

            {/* Main content: 2-column layout on desktop */}
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
              {/* Left column — Gateway Health + Recent Activity */}
              <div className="space-y-6">
                <GatewayHealthSection
                  statusLabel={gatewayStatusLabel}
                  badgeTone={gatewayBadgeTone}
                  rows={gatewayRows}
                  isLoading={gatewayStatusesQuery.isLoading}
                />
                <RecentActivitySection
                  events={recentLogs}
                  buildHref={buildActivityEventHref}
                />
              </div>

              {/* Right column — Pending Approvals */}
              <div>
                <PendingApprovalsSection
                  items={pendingApprovalItems}
                  total={pendingApprovalsTotal}
                  isLoading={!metrics && metricsQuery.isLoading}
                  isError={!metrics && Boolean(metricsQuery.error)}
                />
              </div>
            </div>
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}

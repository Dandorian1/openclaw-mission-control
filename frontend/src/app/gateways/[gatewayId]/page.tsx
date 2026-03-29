"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { AgentsTable } from "@/components/agents/AgentsTable";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/empty-state";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Input } from "@/components/ui/input";

import { ApiError, customFetch } from "@/api/mutator";
import SearchableSelect from "@/components/ui/searchable-select";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type gatewaysStatusApiV1GatewaysStatusGetResponse,
  type getGatewayApiV1GatewaysGatewayIdGetResponse,
  useGatewaysStatusApiV1GatewaysStatusGet,
  useGetGatewayApiV1GatewaysGatewayIdGet,
  useListGatewayModelsApiV1GatewaysModelsGet,
} from "@/api/generated/gateways/gateways";
import {
  type listAgentsApiV1AgentsGetResponse,
  getListAgentsApiV1AgentsGetQueryKey,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import { type AgentRead } from "@/api/generated/model";
import { formatTimestamp } from "@/lib/formatters";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const maskToken = (value?: string | null) => {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
};

export default function GatewayDetailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const { isSignedIn } = useAuth();
  const gatewayIdParam = params?.gatewayId;
  const gatewayId = Array.isArray(gatewayIdParam)
    ? gatewayIdParam[0]
    : gatewayIdParam;

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [deleteTarget, setDeleteTarget] = useState<AgentRead | null>(null);

  // Model configuration state
  const [primaryModel, setPrimaryModel] = useState<string>("");
  const [fallbackInput, setFallbackInput] = useState<string>("");
  const [fallbacks, setFallbacks] = useState<string[]>([]);
  const [modelConfigLoaded, setModelConfigLoaded] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);
  const agentsKey = getListAgentsApiV1AgentsGetQueryKey(
    gatewayId ? { gateway_id: gatewayId } : undefined,
  );

  const gatewayQuery = useGetGatewayApiV1GatewaysGatewayIdGet<
    getGatewayApiV1GatewaysGatewayIdGetResponse,
    ApiError
  >(gatewayId ?? "", {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gatewayId),
      refetchInterval: 30_000,
    },
  });

  const gateway =
    gatewayQuery.data?.status === 200 ? gatewayQuery.data.data : null;

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
    },
  });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(gatewayId ? { gateway_id: gatewayId } : undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gatewayId),
      refetchInterval: 15_000,
    },
  });
  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<
    ApiError,
    { previous?: listAgentsApiV1AgentsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        AgentRead,
        listAgentsApiV1AgentsGetResponse,
        { agentId: string }
      >({
        queryClient,
        queryKey: agentsKey,
        getItemId: (agent) => agent.id,
        getDeleteId: ({ agentId }) => agentId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [agentsKey],
      }),
    },
    queryClient,
  );

  const statusParams = gateway
    ? {
        gateway_url: gateway.url,
        gateway_token: gateway.token ?? undefined,
        gateway_disable_device_pairing: gateway.disable_device_pairing,
        gateway_allow_insecure_tls: gateway.allow_insecure_tls,
      }
    : {};

  const statusQuery = useGatewaysStatusApiV1GatewaysStatusGet<
    gatewaysStatusApiV1GatewaysStatusGetResponse,
    ApiError
  >(statusParams, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gateway),
      refetchInterval: 15_000,
    },
  });

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [],
    [agentsQuery.data],
  );
  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );

  const status =
    statusQuery.data?.status === 200 ? statusQuery.data.data : null;
  const isConnected = status?.connected ?? false;

  // Derive board_id for the models query — find the board linked to this gateway
  const boardIdForModels = useMemo(
    () => boards.find((b) => b.gateway_id === gatewayId)?.id ?? null,
    [boards, gatewayId],
  );

  // Available models from gateway (for the fallback dropdown)
  const gatewayModelsQuery = useListGatewayModelsApiV1GatewaysModelsGet(
    boardIdForModels ? { board_id: boardIdForModels } : undefined,
    { query: { enabled: Boolean(isSignedIn && isAdmin && gateway && isConnected && boardIdForModels), retry: false } },
  );
  const availableModelOptions = useMemo(() => {
    const raw = gatewayModelsQuery.data?.status === 200
      ? (gatewayModelsQuery.data.data?.models ?? [])
      : [];
    return raw
      .map((m) => {
        if (typeof m === "string") return { value: m, label: m };
        if (m && typeof m === "object") {
          const obj = m as Record<string, unknown>;
          const slug =
            typeof obj.id === "string" ? obj.id
            : typeof obj.model === "string" ? obj.model : null;
          const provider =
            typeof obj.provider === "string" ? obj.provider : null;
          // Normalize to provider/model format to match config/models response.
          // models.list returns bare slugs (e.g. "claude-sonnet-4-6") while
          // config/models returns provider-prefixed IDs ("anthropic/claude-sonnet-4-6").
          // Without normalization the dropdown value never matches the saved value.
          const value = slug && provider && !slug.includes("/")
            ? `${provider}/${slug}`
            : slug;
          const label =
            typeof obj.name === "string" ? obj.name
            : typeof obj.alias === "string" ? obj.alias
            : value;
          if (value) return { value, label: label ?? value };
        }
        return null;
      })
      .filter(Boolean) as { value: string; label: string }[];
  }, [gatewayModelsQuery.data]);

  // Fetch current model config from gateway when connected
  const modelConfigFetcher = async () => {
    if (!gatewayId || !isConnected || modelConfigLoaded) return;
    try {
      const res = await customFetch<{ data: { primary?: string | null; fallbacks?: string[] }; status: number }>(
        `/api/v1/gateways/${gatewayId}/config/models`,
        { method: "GET" },
      );
      if (res.status === 200) {
        setPrimaryModel(res.data.primary ?? "");
        setFallbacks(res.data.fallbacks ?? []);
        setModelConfigLoaded(true);
      }
    } catch {
      // silent — gateway may not be reachable
    }
  };

  // Load model config once connected
  if (isConnected && !modelConfigLoaded && gatewayId) {
    void modelConfigFetcher();
  }

  const handleSaveModelConfig = async () => {
    if (!gatewayId) return;
    setModelSaving(true);
    setModelSaveError(null);
    setModelSaveSuccess(false);
    try {
      const res = await customFetch<{ data: { primary?: string | null; fallbacks?: string[]; error?: string | null }; status: number }>(
        `/api/v1/gateways/${gatewayId}/config/models`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primary: primaryModel.trim() || null,
            fallbacks: fallbacks.filter(Boolean),
          }),
        },
      );
      const data = res.data;
      if (data.error) {
        setModelSaveError(data.error);
      } else {
        setPrimaryModel(data.primary ?? "");
        setFallbacks(data.fallbacks ?? []);
        setModelSaveSuccess(true);
        setTimeout(() => setModelSaveSuccess(false), 3000);
      }
    } catch (err) {
      setModelSaveError("Failed to save model configuration.");
    } finally {
      setModelSaving(false);
    }
  };

  const title = useMemo(
    () => (gateway?.name ? gateway.name : "Gateway"),
    [gateway?.name],
  );
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ agentId: deleteTarget.id });
  };

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view a gateway.",
          forceRedirectUrl: `/gateways/${gatewayId}`,
        }}
        title={title}
        description="Gateway configuration and connection details."
        headerActions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/gateways")}>
              Back to gateways
            </Button>
            {isAdmin && gatewayId ? (
              <Button
                onClick={() => router.push(`/gateways/${gatewayId}/edit`)}
              >
                Edit gateway
              </Button>
            ) : null}
          </div>
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access gateways."
      >
        {gatewayQuery.isLoading ? (
          <LoadingState message="Loading gateway…" />
        ) : gatewayQuery.error ? (
          <ErrorState
            title="Failed to load gateway"
            description={gatewayQuery.error.message}
          />
        ) : gateway ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Connection
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        statusQuery.isLoading
                          ? "bg-slate-300"
                          : isConnected
                            ? "bg-emerald-500"
                            : "bg-rose-500"
                      }`}
                    />
                    <span>
                      {statusQuery.isLoading
                        ? "Checking"
                        : isConnected
                          ? "Online"
                          : "Offline"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm text-strong">
                  <div>
                    <p className="text-xs uppercase text-quiet">
                      Gateway URL
                    </p>
                    <p className="mt-1 text-sm font-medium text-strong">
                      {gateway.url}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-quiet">Token</p>
                    <p className="mt-1 text-sm font-medium text-strong">
                      {maskToken(gateway.token)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-quiet">
                      Device pairing
                    </p>
                    <p className="mt-1 text-sm font-medium text-strong">
                      {gateway.disable_device_pairing ? "Disabled" : "Required"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Runtime
                </p>
                <div className="mt-4 space-y-3 text-sm text-strong">
                  <div>
                    <p className="text-xs uppercase text-quiet">
                      Workspace root
                    </p>
                    <p className="mt-1 text-sm font-medium text-strong">
                      {gateway.workspace_root}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-quiet">
                        Created
                      </p>
                      <p className="mt-1 text-sm font-medium text-strong">
                        {formatTimestamp(gateway.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-quiet">
                        Updated
                      </p>
                      <p className="mt-1 text-sm font-medium text-strong">
                        {formatTimestamp(gateway.updated_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Configuration section */}
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Model Configuration
                </p>
                {!isConnected ? (
                  <span className="text-xs text-muted">Connect the gateway to configure models</span>
                ) : null}
              </div>
              {isConnected ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-strong">Default model</label>
                    {availableModelOptions.length > 0 ? (
                      <SearchableSelect
                        ariaLabel="Select default model"
                        value={primaryModel || "__default__"}
                        onValueChange={(value) =>
                          setPrimaryModel(value === "__default__" ? "" : value)
                        }
                        options={[
                          { value: "__default__", label: "Gateway default" },
                          ...availableModelOptions,
                        ]}
                        placeholder="Gateway default"
                        searchPlaceholder="Search models..."
                        emptyMessage="No matching models."
                        disabled={modelSaving}
                        triggerClassName="w-full h-11 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-medium text-strong shadow-sm"
                        contentClassName="rounded-xl border border-[color:var(--border)] shadow-lg"
                        itemClassName="px-4 py-3 text-sm text-strong font-mono data-[selected=true]:bg-[color:var(--surface-muted)]"
                      />
                    ) : (
                      <Input
                        value={primaryModel}
                        onChange={(e) => setPrimaryModel(e.target.value)}
                        placeholder="e.g. anthropic/claude-opus-4-6"
                        disabled={modelSaving}
                        className="font-mono text-sm"
                      />
                    )}
                    <p className="text-xs text-muted">
                      The primary model used by all agents on this gateway unless overridden per-agent.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-strong">Fallback models</label>
                    <div className="space-y-2">
                      {fallbacks.map((fb, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-sm font-mono text-strong">
                            {fb}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFallbacks((prev) => prev.filter((_, idx) => idx !== i))}
                            disabled={modelSaving}
                            className="text-muted hover:text-[color:var(--danger)] transition"
                            aria-label={`Remove fallback ${fb}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <Input
                          value={fallbackInput}
                          onChange={(e) => setFallbackInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = fallbackInput.trim();
                              if (val) { setFallbacks((prev) => [...prev, val]); setFallbackInput(""); }
                            }
                          }}
                          placeholder="Add fallback model (e.g. openai/gpt-4o)"
                          disabled={modelSaving}
                          className="font-mono text-sm flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={modelSaving || !fallbackInput.trim()}
                          onClick={() => {
                            const val = fallbackInput.trim();
                            if (val) { setFallbacks((prev) => [...prev, val]); setFallbackInput(""); }
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      Used in order when the primary model is unavailable.
                    </p>
                  </div>

                  {modelSaveError ? (
                    <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
                      {modelSaveError}
                    </div>
                  ) : null}
                  {modelSaveSuccess ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                      Model configuration saved.
                    </div>
                  ) : null}

                  <Button onClick={handleSaveModelConfig} disabled={modelSaving}>
                    {modelSaving ? "Saving…" : "Save model config"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm text-muted">
                  Gateway is offline. Connect the gateway to view and edit model configuration.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Agents
                </p>
                {agentsQuery.isLoading ? (
                  <span className="text-xs text-muted">Loading…</span>
                ) : (
                  <span className="text-xs text-muted">
                    {agents.length} total
                  </span>
                )}
              </div>
              <div className="mt-4">
                <AgentsTable
                  agents={agents}
                  boards={boards}
                  isLoading={agentsQuery.isLoading}
                  onDelete={setDeleteTarget}
                  emptyMessage="No agents assigned to this gateway."
                />
              </div>
            </div>
          </div>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete agent"
        title="Delete agent"
        description={
          <>
            This will remove {deleteTarget?.name}. This action cannot be undone.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}

"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import { Activity as ActivityIcon, Search } from "lucide-react";

import { ApiError } from "@/api/mutator";
import { streamAgentsApiV1AgentsStreamGet } from "@/api/generated/agents/agents";
import { listActivityApiV1ActivityGet } from "@/api/generated/activity/activity";
import {
  getBoardSnapshotApiV1BoardsBoardIdSnapshotGet,
  listBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet } from "@/api/generated/board-memory/board-memory";
import { streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet } from "@/api/generated/approvals/approvals";
import { streamTasksApiV1BoardsBoardIdTasksStreamGet } from "@/api/generated/tasks/tasks";
import {
  type getMyMembershipApiV1OrganizationsMeMemberGetResponse,
  useGetMyMembershipApiV1OrganizationsMeMemberGet,
} from "@/api/generated/organizations/organizations";
import type {
  ActivityEventRead,
  AgentRead,
  ApprovalRead,
  BoardMemoryRead,
  BoardRead,
  TaskCommentRead,
  TaskRead,
} from "@/api/generated/model";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { createExponentialBackoff } from "@/lib/backoff";
import {
  DEFAULT_HUMAN_LABEL,
  resolveHumanActorName,
  resolveMemberDisplayName,
} from "@/lib/display-name";
import { apiDatetimeToMs } from "@/lib/datetime";
import { usePageActive } from "@/hooks/usePageActive";

import {
  TimelineFeedCard,
  FilterBar,
  TimelineSkeleton,
  type Agent,
  type FeedItem,
  type FeedEventType,
  type TaskMeta,
  type ActivityRouteParams,
  type FilterCategory,
  isTaskEventType,
  normalizeRouteParams,
  buildRouteHref,
  buildBoardHref,
  feedItemElementId,
  normalizeAgent,
  normalizeStatus,
  humanizeApprovalAction,
  humanizeStatus,
  roleFromAgent,
  eventCategory,
} from "./components";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSE_RECONNECT_BACKOFF = {
  baseMs: 1_000,
  factor: 2,
  jitter: 0.2,
  maxMs: 5 * 60_000,
} as const;

const STREAM_CONNECT_SPACING_MS = 120;
const MAX_FEED_ITEMS = 300;
const PAGED_LIMIT = 200;
const PAGED_MAX = 1000;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const isPageActive = usePageActive();

  const selectedEventId = useMemo(() => {
    const value = searchParams.get("eventId");
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);

  const [highlightedFeedItemId, setHighlightedFeedItemId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FilterCategory>>(new Set());
  const [boardFilter, setBoardFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const membershipQuery = useGetMyMembershipApiV1OrganizationsMeMemberGet<
    getMyMembershipApiV1OrganizationsMeMemberGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: false,
    },
  });

  const isOrgAdmin = useMemo(() => {
    const member = membershipQuery.data?.status === 200 ? membershipQuery.data.data : null;
    return member ? ["owner", "admin"].includes(member.role) : false;
  }, [membershipQuery.data]);

  const currentUserDisplayName = useMemo(() => {
    const member = membershipQuery.data?.status === 200 ? membershipQuery.data.data : null;
    return resolveMemberDisplayName(member, DEFAULT_HUMAN_LABEL);
  }, [membershipQuery.data]);

  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [boards, setBoards] = useState<BoardRead[]>([]);

  const feedItemsRef = useRef<FeedItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const boardsByIdRef = useRef<Map<string, BoardRead>>(new Map());
  const taskMetaByIdRef = useRef<Map<string, TaskMeta>>(new Map());
  const agentsByIdRef = useRef<Map<string, Agent>>(new Map());
  const approvalsByIdRef = useRef<Map<string, ApprovalRead>>(new Map());

  useEffect(() => { feedItemsRef.current = feedItems; }, [feedItems]);

  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);

  // ---- Feed manipulation callbacks (unchanged logic) ----

  const pushFeedItem = useCallback((item: FeedItem) => {
    setFeedItems((prev) => {
      if (seenIdsRef.current.has(item.id)) return prev;
      seenIdsRef.current.add(item.id);
      const next = [item, ...prev];
      return next.slice(0, MAX_FEED_ITEMS);
    });
  }, []);

  const resolveAuthor = useCallback(
    (agentId: string | null | undefined, fallbackName: string = currentUserDisplayName) => {
      if (agentId) {
        const agent = agentsByIdRef.current.get(agentId);
        if (agent) return { id: agent.id, name: agent.name, role: roleFromAgent(agent) };
      }
      return { id: agentId ?? null, name: fallbackName, role: null };
    },
    [currentUserDisplayName],
  );

  const boardNameForId = useCallback((boardId: string | null | undefined) => {
    if (!boardId) return null;
    return boardsByIdRef.current.get(boardId)?.name ?? null;
  }, []);

  const updateTaskMeta = useCallback(
    (task: { id: string; title: string; board_id?: string | null }, fallbackBoardId: string) => {
      taskMetaByIdRef.current.set(task.id, { title: task.title, boardId: task.board_id ?? fallbackBoardId });
    },
    [],
  );

  // ---- Event mapping callbacks (preserved from original) ----

  const mapTaskActivity = useCallback(
    (event: ActivityEventRead, fallbackBoardId: string | null = null): FeedItem | null => {
      if (!isTaskEventType(event.event_type)) return null;
      const meta = event.task_id ? taskMetaByIdRef.current.get(event.task_id) : null;
      const routeName = event.route_name ?? null;
      const routeParams = normalizeRouteParams(event.route_params);
      const taskId = event.task_id ?? routeParams.taskId ?? null;
      const boardId = meta?.boardId ?? event.board_id ?? routeParams.boardId ?? fallbackBoardId ?? null;
      const fallbackRouteParams: ActivityRouteParams = {};
      if (boardId) fallbackRouteParams.boardId = boardId;
      if (taskId) fallbackRouteParams.taskId = taskId;
      const effectiveRouteParams = Object.keys(routeParams).length > 0 ? routeParams : fallbackRouteParams;
      const effectiveRouteName = routeName ?? (boardId ? "board" : "activity");
      const author = resolveAuthor(event.agent_id, currentUserDisplayName);
      return {
        id: `activity:${event.id}`,
        created_at: event.created_at,
        event_type: event.event_type,
        message: event.message ?? null,
        source_event_id: event.id,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(effectiveRouteParams, boardId),
        task_id: taskId,
        task_title: meta?.title ?? null,
        title: meta?.title ?? (taskId ? "Unknown task" : "Task activity"),
        context_href: buildRouteHref(effectiveRouteName, effectiveRouteParams, {
          eventId: event.id, eventType: event.event_type, createdAt: event.created_at, taskId,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapTaskComment = useCallback(
    (comment: TaskCommentRead, fallbackBoardId: string): FeedItem => {
      const meta = comment.task_id ? taskMetaByIdRef.current.get(comment.task_id) : null;
      const boardId = meta?.boardId ?? fallbackBoardId;
      const taskId = comment.task_id ?? null;
      const routeParams: ActivityRouteParams = {};
      if (boardId) routeParams.boardId = boardId;
      if (taskId) routeParams.taskId = taskId;
      routeParams.commentId = comment.id;
      const author = resolveAuthor(comment.agent_id, currentUserDisplayName);
      return {
        id: `comment:${comment.id}`,
        created_at: comment.created_at,
        event_type: "task.comment",
        message: comment.message ?? null,
        source_event_id: null,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: taskId,
        task_title: meta?.title ?? null,
        title: meta?.title ?? (taskId ? "Unknown task" : "Task activity"),
        context_href: buildRouteHref("board", routeParams, {
          eventId: comment.id, eventType: "task.comment", createdAt: comment.created_at, taskId,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapApprovalEvent = useCallback(
    (approval: ApprovalRead, boardId: string, previous: ApprovalRead | null = null): FeedItem => {
      const nextStatus = approval.status ?? "pending";
      const previousStatus = previous?.status ?? null;
      const kind: FeedEventType =
        previousStatus === null
          ? nextStatus === "approved" ? "approval.approved"
            : nextStatus === "rejected" ? "approval.rejected"
            : "approval.created"
          : nextStatus !== previousStatus
            ? nextStatus === "approved" ? "approval.approved"
              : nextStatus === "rejected" ? "approval.rejected"
              : "approval.updated"
            : "approval.updated";

      const stamp = kind === "approval.created" ? approval.created_at : (approval.resolved_at ?? approval.created_at);
      const action = humanizeApprovalAction(approval.action_type);
      const author = resolveAuthor(approval.agent_id, currentUserDisplayName);
      const statusText = nextStatus === "approved" ? "approved" : nextStatus === "rejected" ? "rejected" : "pending";
      const message =
        kind === "approval.created" ? `${action} requested (${approval.confidence}% confidence).`
        : kind === "approval.approved" ? `${action} approved (${approval.confidence}% confidence).`
        : kind === "approval.rejected" ? `${action} rejected (${approval.confidence}% confidence).`
        : `${action} updated (${statusText}, ${approval.confidence}% confidence).`;

      const taskMeta = approval.task_id ? taskMetaByIdRef.current.get(approval.task_id) : null;
      const routeParams: ActivityRouteParams = { boardId };
      const taskId = approval.task_id ?? null;
      return {
        id: `approval:${approval.id}:${kind}:${stamp}`,
        created_at: stamp,
        event_type: kind,
        message,
        source_event_id: null,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: taskId,
        task_title: taskMeta?.title ?? null,
        title: `Approval · ${action}`,
        context_href: buildRouteHref("board.approvals", routeParams, {
          eventId: approval.id, eventType: kind, createdAt: stamp, taskId,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapBoardChat = useCallback(
    (memory: BoardMemoryRead, boardId: string): FeedItem => {
      const content = (memory.content ?? "").trim();
      const actorName = resolveHumanActorName(memory.source, currentUserDisplayName);
      const command = content.startsWith("/");
      const routeParams: ActivityRouteParams = { boardId, panel: "chat" };
      return {
        id: `chat:${memory.id}`,
        created_at: memory.created_at,
        event_type: command ? "board.command" : "board.chat",
        message: content || null,
        source_event_id: null,
        agent_id: null,
        actor_name: actorName,
        actor_role: null,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: null,
        task_title: null,
        title: command ? "Board command" : "Board chat",
        context_href: buildRouteHref("board", routeParams, {
          eventId: memory.id, eventType: command ? "board.command" : "board.chat", createdAt: memory.created_at, taskId: null,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName],
  );

  const mapAgentEvent = useCallback(
    (agent: Agent, previous: Agent | null, isSnapshot = false): FeedItem | null => {
      const nextStatus = normalizeStatus(agent.status);
      const previousStatus = previous ? normalizeStatus(previous.status) : null;
      const statusChanged = previousStatus !== null && nextStatus !== previousStatus;
      const profileChanged = Boolean(previous) && (
        previous?.name !== agent.name ||
        previous?.is_board_lead !== agent.is_board_lead ||
        JSON.stringify(previous?.identity_profile ?? {}) !== JSON.stringify(agent.identity_profile ?? {})
      );

      let kind: FeedEventType;
      if (isSnapshot) {
        kind = nextStatus === "online" ? "agent.online" : nextStatus === "offline" ? "agent.offline" : "agent.updated";
      } else if (!previous) {
        kind = "agent.created";
      } else if (statusChanged && nextStatus === "online") {
        kind = "agent.online";
      } else if (statusChanged && nextStatus === "offline") {
        kind = "agent.offline";
      } else if (statusChanged || profileChanged) {
        kind = "agent.updated";
      } else {
        return null;
      }

      const stamp = agent.last_seen_at ?? agent.updated_at ?? agent.created_at;
      const message =
        kind === "agent.created" ? `${agent.name} joined this board.`
        : kind === "agent.online" ? `${agent.name} is online.`
        : kind === "agent.offline" ? `${agent.name} is offline.`
        : `${agent.name} updated (${humanizeStatus(nextStatus)}).`;
      const boardId = agent.board_id ?? null;
      const routeParams: ActivityRouteParams = boardId ? { boardId } : {};
      return {
        id: `agent:${agent.id}:${isSnapshot ? "snapshot" : kind}:${stamp}`,
        created_at: stamp,
        event_type: kind,
        message,
        source_event_id: null,
        agent_id: agent.id,
        actor_name: agent.name,
        actor_role: roleFromAgent(agent),
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: null,
        task_title: null,
        title: `Agent · ${agent.name}`,
        context_href: boardId === null ? null : buildRouteHref("board", routeParams, {
          eventId: agent.id, eventType: kind, createdAt: stamp, taskId: null,
        }),
      };
    },
    [boardNameForId],
  );

  const latestTimestamp = useCallback(
    (predicate: (item: FeedItem) => boolean): string | null => {
      let latest = 0;
      for (const item of feedItemsRef.current) {
        if (!predicate(item)) continue;
        const time = apiDatetimeToMs(item.created_at) ?? 0;
        if (time > latest) latest = time;
      }
      return latest ? new Date(latest).toISOString() : null;
    },
    [],
  );

  // ---- Initial data loading (preserved) ----

  useEffect(() => {
    if (!isSignedIn) {
      setBoards([]); setFeedItems([]); setFeedError(null); setIsFeedLoading(false);
      seenIdsRef.current = new Set();
      boardsByIdRef.current = new Map();
      taskMetaByIdRef.current = new Map();
      agentsByIdRef.current = new Map();
      approvalsByIdRef.current = new Map();
      return;
    }

    let cancelled = false;
    setIsFeedLoading(true);
    setFeedError(null);

    const loadInitial = async () => {
      try {
        const nextBoards: BoardRead[] = [];
        for (let offset = 0; offset < PAGED_MAX; offset += PAGED_LIMIT) {
          const result = await listBoardsApiV1BoardsGet({ limit: PAGED_LIMIT, offset });
          if (cancelled) return;
          if (result.status !== 200) throw new Error("Unable to load boards.");
          const items = result.data.items ?? [];
          nextBoards.push(...items);
          if (items.length < PAGED_LIMIT) break;
        }
        if (cancelled) return;
        setBoards(nextBoards);
        boardsByIdRef.current = new Map(nextBoards.map((b) => [b.id, b]));

        const seeded: FeedItem[] = [];
        const seedSeen = new Set<string>();

        const snapshotResults = await Promise.allSettled(
          nextBoards.map((board) => getBoardSnapshotApiV1BoardsBoardIdSnapshotGet(board.id)),
        );
        if (cancelled) return;

        snapshotResults.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          if (result.value.status !== 200) return;
          const board = nextBoards[index];
          const snapshot = result.value.data;

          (snapshot.tasks ?? []).forEach((task) => {
            taskMetaByIdRef.current.set(task.id, { title: task.title, boardId: board.id });
          });
          (snapshot.agents ?? []).forEach((agent) => {
            const normalized = normalizeAgent(agent);
            agentsByIdRef.current.set(normalized.id, normalized);
            const agentItem = mapAgentEvent(normalized, null, true);
            if (!agentItem || seedSeen.has(agentItem.id)) return;
            seedSeen.add(agentItem.id);
            seeded.push(agentItem);
          });
          (snapshot.approvals ?? []).forEach((approval) => {
            approvalsByIdRef.current.set(approval.id, approval);
            const approvalItem = mapApprovalEvent(approval, board.id, null);
            if (seedSeen.has(approvalItem.id)) return;
            seedSeen.add(approvalItem.id);
            seeded.push(approvalItem);
          });
          (snapshot.chat_messages ?? []).forEach((memory) => {
            const chatItem = mapBoardChat(memory, board.id);
            if (seedSeen.has(chatItem.id)) return;
            seedSeen.add(chatItem.id);
            seeded.push(chatItem);
          });
        });

        for (let offset = 0; offset < PAGED_MAX; offset += PAGED_LIMIT) {
          const result = await listActivityApiV1ActivityGet({ limit: PAGED_LIMIT, offset });
          if (cancelled) return;
          if (result.status !== 200) throw new Error("Unable to load activity feed.");
          const items = result.data.items ?? [];
          for (const event of items) {
            const mapped = mapTaskActivity(event);
            if (!mapped || seedSeen.has(mapped.id)) continue;
            seedSeen.add(mapped.id);
            seeded.push(mapped);
          }
          if (items.length < PAGED_LIMIT) break;
        }

        seeded.sort((a, b) => (apiDatetimeToMs(b.created_at) ?? 0) - (apiDatetimeToMs(a.created_at) ?? 0));
        const next = seeded.slice(0, MAX_FEED_ITEMS);
        if (cancelled) return;
        setFeedItems(next);
        seenIdsRef.current = new Set(next.map((item) => item.id));
      } catch (err) {
        if (cancelled) return;
        setFeedError(err instanceof Error ? err.message : "Unable to load activity feed.");
      } finally {
        if (cancelled) return;
        setIsFeedLoading(false);
      }
    };

    void loadInitial();
    return () => { cancelled = true; };
  }, [isSignedIn, mapAgentEvent, mapApprovalEvent, mapBoardChat, mapTaskActivity]);

  // ---- SSE: Task stream (preserved) ----

  useEffect(() => {
    if (!isPageActive || !isSignedIn || boardIds.length === 0) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp((item) => item.board_id === boardId && isTaskEventType(item.event_type));
          const streamResult = await streamTasksApiV1BoardsBoardIdTasksStreamGet(
            boardId, since ? { since } : undefined,
            { headers: { Accept: "text/event-stream" }, signal: abortController.signal },
          );
          if (streamResult.status !== 200) throw new Error("Unable to connect task stream.");
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) throw new Error("Unable to connect task stream.");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) eventType = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (eventType === "task" && data) {
                try {
                  const payload = JSON.parse(data) as { type?: string; activity?: ActivityEventRead; task?: TaskRead; comment?: TaskCommentRead };
                  if (payload.task) updateTaskMeta(payload.task, boardId);
                  if (payload.activity) {
                    const mapped = mapTaskActivity(payload.activity, boardId);
                    if (mapped) {
                      if (!mapped.task_title && payload.task?.title) { mapped.task_title = payload.task.title; mapped.title = payload.task.title; }
                      pushFeedItem(mapped);
                    }
                  } else if (payload.type === "task.comment" && payload.comment) {
                    pushFeedItem(mapTaskComment(payload.comment, boardId));
                  }
                } catch { /* ignore */ }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch { /* reconnect */ }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => { reconnectTimeout = undefined; void connect(); }, delay);
        }
      };

      connectTimer = window.setTimeout(() => { connectTimer = undefined; void connect(); }, boardDelay);
      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
      });
    });

    return () => { cancelled = true; cleanups.forEach((fn) => fn()); };
  }, [boardIds, boardNameForId, isPageActive, isSignedIn, latestTimestamp, mapTaskActivity, mapTaskComment, pushFeedItem, updateTaskMeta]);

  // ---- SSE: Approval stream (preserved) ----

  useEffect(() => {
    if (!isPageActive || !isSignedIn || boardIds.length === 0) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp((item) => item.board_id === boardId && item.event_type.startsWith("approval."));
          const streamResult = await streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet(
            boardId, since ? { since } : undefined,
            { headers: { Accept: "text/event-stream" }, signal: abortController.signal },
          );
          if (streamResult.status !== 200) throw new Error("Unable to connect approvals stream.");
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) throw new Error("Unable to connect approvals stream.");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) eventType = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (eventType === "approval" && data) {
                try {
                  const payload = JSON.parse(data) as { approval?: ApprovalRead };
                  if (payload.approval) {
                    const previous = approvalsByIdRef.current.get(payload.approval.id) ?? null;
                    approvalsByIdRef.current.set(payload.approval.id, payload.approval);
                    pushFeedItem(mapApprovalEvent(payload.approval, boardId, previous));
                  }
                } catch { /* ignore */ }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch { /* reconnect */ }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => { reconnectTimeout = undefined; void connect(); }, delay);
        }
      };

      connectTimer = window.setTimeout(() => { connectTimer = undefined; void connect(); }, boardDelay);
      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
      });
    });

    return () => { cancelled = true; cleanups.forEach((fn) => fn()); };
  }, [boardIds, isPageActive, isSignedIn, latestTimestamp, mapApprovalEvent, pushFeedItem]);

  // ---- SSE: Board chat stream (preserved) ----

  useEffect(() => {
    if (!isPageActive || !isSignedIn || boardIds.length === 0) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp((item) => item.board_id === boardId && (item.event_type === "board.chat" || item.event_type === "board.command"));
          const params = { is_chat: true, ...(since ? { since } : {}) };
          const streamResult = await streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet(
            boardId, params,
            { headers: { Accept: "text/event-stream" }, signal: abortController.signal },
          );
          if (streamResult.status !== 200) throw new Error("Unable to connect board chat stream.");
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) throw new Error("Unable to connect board chat stream.");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) eventType = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (eventType === "memory" && data) {
                try {
                  const payload = JSON.parse(data) as { memory?: BoardMemoryRead };
                  if (payload.memory?.tags?.includes("chat")) {
                    pushFeedItem(mapBoardChat(payload.memory, boardId));
                  }
                } catch { /* ignore */ }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch { /* reconnect */ }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => { reconnectTimeout = undefined; void connect(); }, delay);
        }
      };

      connectTimer = window.setTimeout(() => { connectTimer = undefined; void connect(); }, boardDelay);
      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
      });
    });

    return () => { cancelled = true; cleanups.forEach((fn) => fn()); };
  }, [boardIds, isPageActive, isSignedIn, latestTimestamp, mapBoardChat, pushFeedItem]);

  // ---- SSE: Agent stream (preserved) ----

  useEffect(() => {
    if (!isPageActive || !isSignedIn || !isOrgAdmin) return;
    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp((item) => item.event_type.startsWith("agent."));
        const streamResult = await streamAgentsApiV1AgentsStreamGet(
          since ? { since } : undefined,
          { headers: { Accept: "text/event-stream" }, signal: abortController.signal },
        );
        if (streamResult.status !== 200) throw new Error("Unable to connect agent stream.");
        const response = streamResult.data as Response;
        if (!(response instanceof Response) || !response.body) throw new Error("Unable to connect agent stream.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) backoff.reset();
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) eventType = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (eventType === "agent" && data) {
              try {
                const payload = JSON.parse(data) as { agent?: AgentRead };
                if (payload.agent) {
                  const normalized = normalizeAgent(payload.agent);
                  const previous = agentsByIdRef.current.get(normalized.id) ?? null;
                  agentsByIdRef.current.set(normalized.id, normalized);
                  const mapped = mapAgentEvent(normalized, previous, false);
                  if (mapped) pushFeedItem(mapped);
                }
              } catch { /* ignore */ }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch { /* reconnect */ }

      if (!cancelled) {
        if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
        const delay = backoff.nextDelayMs();
        reconnectTimeout = window.setTimeout(() => { reconnectTimeout = undefined; void connect(); }, delay);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout !== undefined) window.clearTimeout(reconnectTimeout);
    };
  }, [isOrgAdmin, isPageActive, isSignedIn, latestTimestamp, mapAgentEvent, pushFeedItem]);

  // ---- Filtered & sorted feed ----

  const orderedFeed = useMemo(() => {
    return [...feedItems].sort((a, b) => (apiDatetimeToMs(b.created_at) ?? 0) - (apiDatetimeToMs(a.created_at) ?? 0));
  }, [feedItems]);

  const filteredFeed = useMemo(() => {
    let items = orderedFeed;
    if (activeFilters.size > 0) {
      items = items.filter((item) => activeFilters.has(eventCategory(item.event_type)));
    }
    if (boardFilter) {
      items = items.filter((item) => item.board_id === boardFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.actor_name.toLowerCase().includes(q) ||
          (item.message ?? "").toLowerCase().includes(q) ||
          (item.board_name ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [orderedFeed, activeFilters, boardFilter, searchQuery]);

  // ---- Deep link highlight ----

  const selectedFeedItemId = useMemo(() => {
    if (!selectedEventId) return null;
    const directMatch = orderedFeed.find((item) => item.source_event_id === selectedEventId);
    if (directMatch) return directMatch.id;
    const fallbackMatch = orderedFeed.find((item) => item.id === selectedEventId || item.id === `activity:${selectedEventId}`);
    return fallbackMatch?.id ?? null;
  }, [orderedFeed, selectedEventId]);

  useEffect(() => {
    if (!selectedFeedItemId) { setHighlightedFeedItemId(null); return; }
    setHighlightedFeedItemId(selectedFeedItemId);
    const scrollTimeout = window.setTimeout(() => {
      const element = document.getElementById(feedItemElementId(selectedFeedItemId));
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const clearHighlightTimeout = window.setTimeout(() => {
      setHighlightedFeedItemId((current) => current === selectedFeedItemId ? null : current);
    }, 4_000);
    return () => { window.clearTimeout(scrollTimeout); window.clearTimeout(clearHighlightTimeout); };
  }, [selectedFeedItemId]);

  const hasUnresolvedDeepLink = Boolean(selectedEventId && !selectedFeedItemId && !isFeedLoading && !feedError);

  // ---- Filter handlers ----

  const handleToggleFilter = useCallback((category: FilterCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // ---- Render ----

  return (
    <DashboardShell>
      {isMounted ? (
        <>
          <SignedOut>
            <SignedOutPanel
              message="Sign in to view the feed."
              forceRedirectUrl="/activity"
              signUpForceRedirectUrl="/activity"
              mode="redirect"
              buttonTestId="activity-signin"
            />
          </SignedOut>
          <SignedIn>
            <DashboardSidebar />
            <main className="flex-1 overflow-y-auto bg-[color:var(--surface-muted)]">
              {/* Header */}
              <div className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
                <div className="px-4 py-4 md:px-8 md:py-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <ActivityIcon className="h-5 w-5 text-muted" />
                        <h1 className="text-2xl font-semibold tracking-tight text-strong">
                          Activity Feed
                        </h1>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        Real-time events across all boards
                      </p>
                    </div>
                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        placeholder="Search activity…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] py-1.5 pl-9 pr-3 text-sm text-strong placeholder:text-muted outline-none transition focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
                      />
                    </div>
                  </div>

                  {/* Filter bar */}
                  <div className="mt-4">
                    <FilterBar
                      activeFilters={activeFilters}
                      onToggleFilter={handleToggleFilter}
                      boardFilter={boardFilter}
                      boards={boards.map((b) => ({ id: b.id, name: b.name }))}
                      onBoardFilterChange={setBoardFilter}
                    />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 md:p-8">
                {hasUnresolvedDeepLink ? (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Requested activity item is not in the current feed window yet.
                  </div>
                ) : null}

                {isFeedLoading && feedItems.length === 0 ? (
                  <TimelineSkeleton />
                ) : feedError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {feedError}
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-700 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredFeed.length === 0 ? (
                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-12 text-center shadow-sm">
                    <ActivityIcon className="mx-auto h-10 w-10 text-muted opacity-40" />
                    <p className="mt-4 text-sm font-medium text-strong">
                      {activeFilters.size > 0 || boardFilter || searchQuery
                        ? "No matching activity"
                        : "No activity yet"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {activeFilters.size > 0 || boardFilter || searchQuery
                        ? "Try adjusting your filters or search query."
                        : "When updates happen, they will show up here."}
                    </p>
                  </div>
                ) : (
                  <div>
                    {filteredFeed.map((item) => (
                      <TimelineFeedCard
                        key={item.id}
                        item={item}
                        isHighlighted={highlightedFeedItemId === item.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </main>
          </SignedIn>
        </>
      ) : null}
    </DashboardShell>
  );
}

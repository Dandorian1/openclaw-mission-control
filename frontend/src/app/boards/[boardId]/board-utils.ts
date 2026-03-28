/**
 * Shared utility functions for the boards/[boardId] page and its components.
 */
import type { TaskCardRead, TaskCommentRead, AgentRead, ApprovalRead, ActivityEventRead, OrganizationMemberRead } from "@/api/generated/model";
import { ApiError } from "@/api/mutator";
import { parseApiDatetime, apiDatetimeToMs } from "@/lib/datetime";
import { resolveHumanActorName, DEFAULT_HUMAN_LABEL } from "@/lib/display-name";

import type {
  Task,
  Agent,
  Approval,
  TaskComment,
  BoardChatMessage,
  LiveFeedItem,
  LiveFeedEventType,
} from "./board-types";
import { isLiveFeedEventType } from "./board-types";

// ─── Live Feed Helpers ───────────────────────────────────────────────

export const toLiveFeedFromActivity = (
  event: ActivityEventRead,
): LiveFeedItem | null => {
  if (!isLiveFeedEventType(event.event_type)) {
    return null;
  }
  return {
    id: event.id,
    created_at: event.created_at,
    message: event.message ?? null,
    agent_id: event.agent_id ?? null,
    task_id: event.task_id ?? null,
    title: null,
    event_type: event.event_type,
  };
};

export const toLiveFeedFromComment = (comment: TaskCommentRead): LiveFeedItem => ({
  id: comment.id,
  created_at: comment.created_at,
  message: comment.message ?? null,
  agent_id: comment.agent_id ?? null,
  actor_name: null,
  task_id: comment.task_id ?? null,
  title: null,
  event_type: "task.comment",
});

export const mergeCommentsById = (...collections: TaskComment[][]): TaskComment[] => {
  const byId = new Map<string, TaskComment>();
  for (const collection of collections) {
    for (const comment of collection) {
      const existing = byId.get(comment.id);
      if (!existing) {
        byId.set(comment.id, comment);
        continue;
      }
      const existingTime = apiDatetimeToMs(existing.created_at) ?? 0;
      const incomingTime = apiDatetimeToMs(comment.created_at) ?? 0;
      byId.set(
        comment.id,
        incomingTime >= existingTime
          ? { ...existing, ...comment }
          : { ...comment, ...existing },
      );
    }
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = apiDatetimeToMs(a.created_at) ?? 0;
    const bTime = apiDatetimeToMs(b.created_at) ?? 0;
    return bTime - aTime;
  });
};

export const toLiveFeedFromBoardChat = (memory: BoardChatMessage): LiveFeedItem => {
  const content = (memory.content ?? "").trim();
  const actorName = resolveHumanActorName(memory.source, DEFAULT_HUMAN_LABEL);
  const isCommand = content.startsWith("/");
  return {
    id: `chat:${memory.id}`,
    created_at: memory.created_at,
    message: content || null,
    agent_id: null,
    actor_name: actorName,
    task_id: null,
    title: isCommand ? "Board command" : "Board chat",
    event_type: isCommand ? "board.command" : "board.chat",
  };
};

export const normalizeAgentStatus = (value?: string | null): string => {
  const status = (value ?? "").trim().toLowerCase();
  return status || "offline";
};

export const humanizeAgentStatus = (value: string): string =>
  value.replace(/_/g, " ").trim() || "offline";

export const toLiveFeedFromAgentSnapshot = (agent: Agent): LiveFeedItem => {
  const status = normalizeAgentStatus(agent.status);
  const stamp = agent.last_seen_at ?? agent.updated_at ?? agent.created_at;
  const eventType: LiveFeedEventType =
    status === "online"
      ? "agent.online"
      : status === "offline"
        ? "agent.offline"
        : "agent.updated";
  return {
    id: `agent:${agent.id}:snapshot:${status}:${stamp}`,
    created_at: stamp,
    message: `${agent.name} is ${humanizeAgentStatus(status)}.`,
    agent_id: agent.id,
    actor_name: null,
    task_id: null,
    title: `Agent · ${agent.name}`,
    event_type: eventType,
  };
};

export const toLiveFeedFromAgentUpdate = (
  agent: Agent,
  previous: Agent | null,
): LiveFeedItem | null => {
  const nextStatus = normalizeAgentStatus(agent.status);
  const previousStatus = previous
    ? normalizeAgentStatus(previous.status)
    : null;
  const statusChanged =
    previousStatus !== null && nextStatus !== previousStatus;
  const isNew = previous === null;
  const profileChanged =
    Boolean(previous) &&
    (previous?.name !== agent.name ||
      previous?.is_board_lead !== agent.is_board_lead ||
      JSON.stringify(previous?.identity_profile ?? {}) !==
        JSON.stringify(agent.identity_profile ?? {}));

  let eventType: LiveFeedEventType;
  if (isNew) {
    eventType = "agent.created";
  } else if (statusChanged && nextStatus === "online") {
    eventType = "agent.online";
  } else if (statusChanged && nextStatus === "offline") {
    eventType = "agent.offline";
  } else if (statusChanged || profileChanged) {
    eventType = "agent.updated";
  } else {
    return null;
  }

  const stamp = agent.last_seen_at ?? agent.updated_at ?? agent.created_at;
  const message =
    eventType === "agent.created"
      ? `${agent.name} joined this board.`
      : eventType === "agent.online"
        ? `${agent.name} is online.`
        : eventType === "agent.offline"
          ? `${agent.name} is offline.`
          : `${agent.name} updated (${humanizeAgentStatus(nextStatus)}).`;
  return {
    id: `agent:${agent.id}:${eventType}:${stamp}`,
    created_at: stamp,
    message,
    agent_id: agent.id,
    actor_name: null,
    task_id: null,
    title: `Agent · ${agent.name}`,
    event_type: eventType,
  };
};

export const humanizeLiveFeedApprovalAction = (value: string): string => {
  const cleaned = value.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Approval";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export const toLiveFeedFromApproval = (
  approval: ApprovalRead,
  previous: ApprovalRead | null = null,
): LiveFeedItem => {
  const nextStatus = approval.status ?? "pending";
  const previousStatus = previous?.status ?? null;
  const eventType: LiveFeedEventType =
    previousStatus === null
      ? nextStatus === "approved"
        ? "approval.approved"
        : nextStatus === "rejected"
          ? "approval.rejected"
          : "approval.created"
      : nextStatus !== previousStatus
        ? nextStatus === "approved"
          ? "approval.approved"
          : nextStatus === "rejected"
            ? "approval.rejected"
            : "approval.updated"
        : "approval.updated";
  const stamp =
    eventType === "approval.created"
      ? approval.created_at
      : (approval.resolved_at ?? approval.created_at);
  const action = humanizeLiveFeedApprovalAction(approval.action_type);
  const statusText =
    nextStatus === "approved"
      ? "approved"
      : nextStatus === "rejected"
        ? "rejected"
        : "pending";
  const message =
    eventType === "approval.created"
      ? `${action} requested (${approval.confidence}% confidence).`
      : eventType === "approval.approved"
        ? `${action} approved (${approval.confidence}% confidence).`
        : eventType === "approval.rejected"
          ? `${action} rejected (${approval.confidence}% confidence).`
          : `${action} updated (${statusText}, ${approval.confidence}% confidence).`;
  return {
    id: `approval:${approval.id}:${eventType}:${stamp}`,
    created_at: stamp,
    message,
    agent_id: approval.agent_id ?? null,
    actor_name: null,
    task_id: approval.task_id ?? null,
    title: `Approval · ${action}`,
    event_type: eventType,
  };
};

export const liveFeedEventLabel = (eventType: LiveFeedEventType): string => {
  if (eventType === "task.comment") return "Comment";
  if (eventType === "task.created") return "Created";
  if (eventType === "task.status_changed") return "Status";
  if (eventType === "board.chat") return "Chat";
  if (eventType === "board.command") return "Command";
  if (eventType === "agent.created") return "Agent";
  if (eventType === "agent.online") return "Online";
  if (eventType === "agent.offline") return "Offline";
  if (eventType === "agent.updated") return "Agent update";
  if (eventType === "approval.created") return "Approval";
  if (eventType === "approval.updated") return "Approval update";
  if (eventType === "approval.approved") return "Approved";
  if (eventType === "approval.rejected") return "Rejected";
  return "Updated";
};

export const liveFeedEventPillClass = (eventType: LiveFeedEventType): string => {
  if (eventType === "task.comment") return "border-blue-200 bg-blue-50 text-blue-700";
  if (eventType === "task.created") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (eventType === "task.status_changed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (eventType === "board.chat") return "border-teal-200 bg-teal-50 text-teal-700";
  if (eventType === "board.command") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (eventType === "agent.created") return "border-violet-200 bg-violet-50 text-violet-700";
  if (eventType === "agent.online") return "border-lime-200 bg-lime-50 text-lime-700";
  if (eventType === "agent.offline") return "border-slate-300 bg-[color:var(--surface-strong)] text-strong";
  if (eventType === "agent.updated") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (eventType === "approval.created") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (eventType === "approval.updated") return "border-sky-200 bg-sky-50 text-sky-700";
  if (eventType === "approval.approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (eventType === "approval.rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-[color:var(--border)] bg-[color:var(--surface-strong)] text-strong";
};

// ─── Normalizers ─────────────────────────────────────────────────────

export const normalizeTask = (task: TaskCardRead): Task => ({
  ...task,
  status: task.status ?? "inbox",
  priority: task.priority ?? "medium",
  approvals_count: task.approvals_count ?? 0,
  approvals_pending_count: task.approvals_pending_count ?? 0,
});

export const normalizeAgent = (agent: AgentRead): Agent => ({
  ...agent,
  status: agent.status ?? "offline",
});

export const normalizeApproval = (approval: ApprovalRead): Approval => ({
  ...approval,
  status: approval.status ?? "pending",
});

export const normalizeTagColor = (value?: string | null) => {
  const cleaned = (value ?? "").trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(cleaned)) return "9e9e9e";
  return cleaned;
};

// ─── Formatters ──────────────────────────────────────────────────────

export const formatShortTimestamp = (value: string) => {
  const date = parseApiDatetime(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const commentElementId = (id: string): string =>
  `task-comment-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const formatActionError = (err: unknown, fallback: string) => {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "Read-only access. You do not have permission to make changes.";
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
};

export const resolveBoardAccess = (
  member: OrganizationMemberRead | null,
  boardId?: string | null,
) => {
  if (!member || !boardId) {
    return { canRead: false, canWrite: false };
  }
  if (member.all_boards_write) {
    return { canRead: true, canWrite: true };
  }
  if (member.all_boards_read) {
    return { canRead: true, canWrite: false };
  }
  const entry = member.board_access?.find(
    (access) => access.board_id === boardId,
  );
  if (!entry) {
    return { canRead: false, canWrite: false };
  }
  const canWrite = Boolean(entry.can_write);
  const canRead = Boolean(entry.can_read || entry.can_write);
  return { canRead, canWrite };
};

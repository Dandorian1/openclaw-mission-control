import type { AgentRead, ActivityEventRead } from "@/api/generated/model";
import { parseApiDatetime } from "@/lib/datetime";
import type {
  Agent,
  ActivityRouteParams,
  FeedEventType,
  TaskEventType,
  FilterCategory,
} from "./types";

export const ACTIVITY_FEED_PATH = "/activity";

export const TASK_EVENT_TYPES = new Set<TaskEventType>([
  "task.comment",
  "task.created",
  "task.updated",
  "task.status_changed",
]);

export const isTaskEventType = (value: string): value is TaskEventType =>
  TASK_EVENT_TYPES.has(value as TaskEventType);

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

export const formatRelativeTime = (value: string): string => {
  const date = parseApiDatetime(value);
  if (!date) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortTimestamp(value);
};

export const normalizeRouteParams = (
  params: ActivityEventRead["route_params"] | ActivityRouteParams | null | undefined,
): ActivityRouteParams => {
  if (!params || typeof params !== "object") return {};
  return Object.entries(params).reduce<ActivityRouteParams>((acc, [key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

export const buildRouteHref = (
  routeName: string | null | undefined,
  routeParams: ActivityRouteParams,
  fallback: {
    eventId: string;
    eventType: string;
    createdAt: string;
    taskId: string | null;
  },
): string => {
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
          eventId: fallback.eventId,
          eventType: fallback.eventType,
          createdAt: fallback.createdAt,
        },
  );
  if (fallback.taskId && !params.has("taskId")) {
    params.set("taskId", fallback.taskId);
  }
  return `${ACTIVITY_FEED_PATH}?${params.toString()}`;
};

export const buildBoardHref = (
  routeParams: ActivityRouteParams,
  boardId: string | null,
): string | null => {
  const resolved = routeParams.boardId ?? boardId;
  if (!resolved) return null;
  return `/boards/${encodeURIComponent(resolved)}`;
};

export const feedItemElementId = (id: string): string =>
  `activity-item-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const normalizeAgent = (agent: AgentRead): Agent => ({
  ...agent,
  status: (agent.status ?? "offline").trim() || "offline",
});

export const normalizeStatus = (value?: string | null) =>
  (value ?? "").trim().toLowerCase() || "offline";

export const humanizeApprovalAction = (value: string): string => {
  const cleaned = value.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Approval";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export const humanizeStatus = (value: string): string =>
  value.replace(/_/g, " ").trim() || "offline";

export const roleFromAgent = (agent?: Agent | null): string | null => {
  if (!agent) return null;
  const profile = agent.identity_profile;
  if (!profile || typeof profile !== "object") return null;
  const role = profile.role;
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  return trimmed || null;
};

export const eventLabel = (eventType: FeedEventType): string => {
  if (eventType === "task.comment") return "Comment";
  if (eventType === "task.created") return "Task Created";
  if (eventType === "task.updated") return "Task Updated";
  if (eventType === "task.status_changed") return "Status Change";
  if (eventType === "board.chat") return "Chat";
  if (eventType === "board.command") return "Command";
  if (eventType === "agent.created") return "Agent Joined";
  if (eventType === "agent.online") return "Online";
  if (eventType === "agent.offline") return "Offline";
  if (eventType === "agent.updated") return "Agent Update";
  if (eventType === "approval.created") return "Approval Request";
  if (eventType === "approval.updated") return "Approval Update";
  if (eventType === "approval.approved") return "Approved";
  if (eventType === "approval.rejected") return "Rejected";
  return "Updated";
};

/** Map event types to filter categories */
export const eventCategory = (eventType: FeedEventType): FilterCategory => {
  if (eventType === "task.comment") return "comment";
  if (eventType.startsWith("task.")) return "task";
  if (eventType.startsWith("agent.")) return "agent";
  if (eventType.startsWith("approval.")) return "approval";
  if (eventType === "board.chat" || eventType === "board.command") return "chat";
  return "system";
};

/** Timeline dot color class by event category */
export const dotColor = (eventType: FeedEventType): string => {
  const cat = eventCategory(eventType);
  switch (cat) {
    case "task":
      return "bg-blue-500";
    case "comment":
      return "bg-emerald-500";
    case "agent":
      return "bg-violet-500";
    case "approval":
      return "bg-amber-500";
    case "chat":
      return "bg-teal-500";
    default:
      return "bg-slate-400";
  }
};

/** Pill badge color class (dark-mode safe) */
export const eventPillClass = (eventType: FeedEventType): string => {
  const cat = eventCategory(eventType);
  switch (cat) {
    case "task":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "comment":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "agent":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300";
    case "approval":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "chat":
      return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
  }
};

export const FILTER_CATEGORIES: { key: FilterCategory; label: string; color: string }[] = [
  { key: "task", label: "Tasks", color: "bg-blue-500" },
  { key: "comment", label: "Comments", color: "bg-emerald-500" },
  { key: "agent", label: "Agents", color: "bg-violet-500" },
  { key: "approval", label: "Approvals", color: "bg-amber-500" },
  { key: "chat", label: "Chat", color: "bg-teal-500" },
  { key: "system", label: "System", color: "bg-slate-400" },
];

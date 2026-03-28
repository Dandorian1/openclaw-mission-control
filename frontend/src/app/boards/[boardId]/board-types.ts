/**
 * Shared types and constants for the boards/[boardId] page and its components.
 */
import type { TaskCardRead, TaskCommentRead, AgentRead, ApprovalRead, BoardMemoryRead, ActivityEventRead, BoardRead } from "@/api/generated/model";
import type { createTaskApiV1BoardsBoardIdTasksPost, updateTaskApiV1BoardsBoardIdTasksTaskIdPatch } from "@/api/generated/tasks/tasks";
import type { TaskCustomFieldValues } from "./custom-field-utils";

export type Board = BoardRead;

export type TaskStatus = Exclude<TaskCardRead["status"], undefined>;

export type TaskCustomFieldPayload = {
  custom_field_values?: TaskCustomFieldValues;
};

export type Task = Omit<
  TaskCardRead,
  "status" | "priority" | "approvals_count" | "approvals_pending_count"
> & {
  status: TaskStatus;
  priority: string;
  approvals_count: number;
  approvals_pending_count: number;
  custom_field_values?: TaskCustomFieldValues | null;
};

export type Agent = AgentRead & { status: string };

export type TaskComment = TaskCommentRead;

export type Approval = ApprovalRead & { status: string };

export type BoardChatMessage = BoardMemoryRead;

export type MessageUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost?: number | null;
  context_pct?: number | null;
  model?: string | null;
};

export type LiveFeedEventType =
  | "task.comment"
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "board.chat"
  | "board.command"
  | "agent.created"
  | "agent.online"
  | "agent.offline"
  | "agent.updated"
  | "approval.created"
  | "approval.updated"
  | "approval.approved"
  | "approval.rejected";

export type LiveFeedItem = {
  id: string;
  created_at: string;
  message: string | null;
  agent_id: string | null;
  actor_name?: string | null;
  task_id: string | null;
  title?: string | null;
  event_type: LiveFeedEventType;
};

export type ToastMessage = {
  id: number;
  message: string;
  tone: "error" | "success";
};

export type BoardTaskCreatePayload = Parameters<
  typeof createTaskApiV1BoardsBoardIdTasksPost
>[1] &
  TaskCustomFieldPayload;
export type BoardTaskUpdatePayload = Parameters<
  typeof updateTaskApiV1BoardsBoardIdTasksTaskIdPatch
>[2] &
  TaskCustomFieldPayload;

export const LIVE_FEED_EVENT_TYPES = new Set<LiveFeedEventType>([
  "task.comment",
  "task.created",
  "task.updated",
  "task.status_changed",
  "board.chat",
  "board.command",
  "agent.created",
  "agent.online",
  "agent.offline",
  "agent.updated",
  "approval.created",
  "approval.updated",
  "approval.approved",
  "approval.rejected",
]);

export const isLiveFeedEventType = (value: string): value is LiveFeedEventType =>
  LIVE_FEED_EVENT_TYPES.has(value as LiveFeedEventType);

export const priorities = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const statusOptions = [
  { value: "inbox", label: "Inbox" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "wont_do", label: "Won't do" },
];

export const SSE_RECONNECT_BACKOFF = {
  baseMs: 1_000,
  factor: 2,
  jitter: 0.2,
  maxMs: 5 * 60_000,
} as const;

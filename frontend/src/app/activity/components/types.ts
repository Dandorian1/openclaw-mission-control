import type { AgentRead } from "@/api/generated/model";

export type Agent = AgentRead & { status: string };

export type TaskEventType =
  | "task.comment"
  | "task.created"
  | "task.updated"
  | "task.status_changed";

export type FeedEventType =
  | TaskEventType
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

export type FeedItem = {
  id: string;
  created_at: string;
  event_type: FeedEventType;
  message: string | null;
  source_event_id: string | null;
  agent_id: string | null;
  actor_name: string;
  actor_role: string | null;
  board_id: string | null;
  board_name: string | null;
  board_href: string | null;
  task_id: string | null;
  task_title: string | null;
  title: string;
  context_href: string | null;
};

export type TaskMeta = {
  title: string;
  boardId: string | null;
};

export type ActivityRouteParams = Record<string, string>;

export type FilterCategory = "task" | "comment" | "agent" | "approval" | "chat" | "system";

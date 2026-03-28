"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/atoms/Markdown";
import type { TaskComment } from "../board-types";
import { commentElementId, formatShortTimestamp } from "../board-utils";

export const TaskCommentCard = memo(function TaskCommentCard({
  comment,
  authorLabel,
  isHighlighted = false,
}: {
  comment: TaskComment;
  authorLabel: string;
  isHighlighted?: boolean;
}) {
  const message = (comment.message ?? "").trim();
  return (
    <div
      id={commentElementId(comment.id)}
      className={cn(
        "scroll-mt-28 rounded-xl border bg-[color:var(--surface)] p-3 transition",
        isHighlighted
          ? "border-blue-300 ring-2 ring-blue-200"
          : "border-[color:var(--border)]",
      )}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{authorLabel}</span>
        <span>{formatShortTimestamp(comment.created_at)}</span>
      </div>
      {message ? (
        <div className="mt-2 select-text cursor-text text-sm leading-relaxed text-strong break-words">
          <Markdown content={message} variant="comment" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-strong">—</p>
      )}
    </div>
  );
});

TaskCommentCard.displayName = "TaskCommentCard";

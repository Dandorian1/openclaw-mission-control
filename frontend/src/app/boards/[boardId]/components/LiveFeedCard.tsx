"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/atoms/Markdown";
import type { LiveFeedItem } from "../board-types";
import { liveFeedEventLabel, liveFeedEventPillClass, formatShortTimestamp } from "../board-utils";

export const LiveFeedCard = memo(function LiveFeedCard({
  item,
  taskTitle,
  authorName,
  authorRole,
  authorAvatar,
  onViewTask,
  isNew,
}: {
  item: LiveFeedItem;
  taskTitle: string;
  authorName: string;
  authorRole?: string | null;
  authorAvatar: string;
  onViewTask?: () => void;
  isNew?: boolean;
}) {
  const message = (item.message ?? "").trim();
  const eventLabel = liveFeedEventLabel(item.event_type);
  const eventPillClass = liveFeedEventPillClass(item.event_type);
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors duration-300",
        isNew
          ? "border-blue-200 bg-blue-50/70 shadow-sm hover:border-blue-300 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-right-2 motion-safe:duration-300"
          : "border-[color:var(--border)] bg-[color:var(--surface)] hover:border-slate-300",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-strong)] text-xs font-semibold text-strong">
          {authorAvatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onViewTask}
              disabled={!onViewTask}
              className={cn(
                "text-left text-sm font-semibold leading-snug text-strong",
                onViewTask
                  ? "cursor-pointer transition hover:text-slate-950 hover:underline"
                  : "cursor-default",
              )}
              title={taskTitle}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {taskTitle}
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                eventPillClass,
              )}
            >
              {eventLabel}
            </span>
            <span className="font-medium text-strong">{authorName}</span>
            {authorRole ? (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-muted">{authorRole}</span>
              </>
            ) : null}
            <span className="text-slate-300">·</span>
            <span className="text-quiet">
              {formatShortTimestamp(item.created_at)}
            </span>
          </div>
        </div>
      </div>
      {message ? (
        <div className="mt-3 select-text cursor-text text-sm leading-relaxed text-strong break-words">
          <Markdown content={message} variant="basic" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">—</p>
      )}
    </div>
  );
});

LiveFeedCard.displayName = "LiveFeedCard";

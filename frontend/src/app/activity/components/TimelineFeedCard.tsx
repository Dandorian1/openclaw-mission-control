"use client";

import { memo } from "react";
import Link from "next/link";
import { Markdown } from "@/components/atoms/Markdown";
import { cn } from "@/lib/utils";
import type { FeedItem } from "./types";
import {
  dotColor,
  eventLabel,
  eventPillClass,
  feedItemElementId,
  formatRelativeTime,
  formatShortTimestamp,
} from "./helpers";

export const TimelineFeedCard = memo(function TimelineFeedCard({
  item,
  isHighlighted = false,
}: {
  item: FeedItem;
  isHighlighted?: boolean;
}) {
  const message = (item.message ?? "").trim();
  const authorInitial = (item.actor_name[0] ?? "A").toUpperCase();

  return (
    <div
      id={feedItemElementId(item.id)}
      className="group relative flex gap-4 scroll-mt-28"
    >
      {/* Timeline connector */}
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            "z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-[color:var(--surface-muted)]",
            dotColor(item.event_type),
          )}
        />
        <div className="w-px flex-1 bg-[color:var(--border)]" />
      </div>

      {/* Card */}
      <div
        className={cn(
          "mb-4 flex-1 rounded-xl border bg-[color:var(--surface)] p-4 shadow-sm transition-all duration-150",
          isHighlighted
            ? "border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-900"
            : "border-[color:var(--border)] hover:border-slate-300 hover:shadow-md dark:hover:border-slate-600",
        )}
      >
        {/* Top row: avatar, title, timestamp */}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-xs font-semibold text-strong">
            {authorInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {item.context_href ? (
                  <Link
                    href={item.context_href}
                    className="text-sm font-semibold leading-snug text-strong transition hover:underline"
                    title={item.title}
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold leading-snug text-strong">
                    {item.title}
                  </p>
                )}
              </div>
              <span
                className="shrink-0 text-[11px] text-muted"
                title={formatShortTimestamp(item.created_at)}
              >
                {formatRelativeTime(item.created_at)}
              </span>
            </div>

            {/* Meta row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  eventPillClass(item.event_type),
                )}
              >
                {eventLabel(item.event_type)}
              </span>
              <span className="text-xs font-medium text-strong">
                {item.actor_name}
              </span>
              {item.actor_role ? (
                <>
                  <span className="text-[10px] text-muted">·</span>
                  <span className="text-[11px] text-muted">{item.actor_role}</span>
                </>
              ) : null}
              {item.board_name ? (
                <>
                  <span className="text-[10px] text-muted">·</span>
                  {item.board_href ? (
                    <Link
                      href={item.board_href}
                      className="text-[11px] font-medium text-muted hover:text-strong hover:underline"
                    >
                      {item.board_name}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted">
                      {item.board_name}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Message body */}
        {message ? (
          <div className="mt-3 ml-11 select-text cursor-text text-sm leading-relaxed text-strong break-words">
            <Markdown content={message} variant="basic" />
          </div>
        ) : null}
      </div>
    </div>
  );
});

TimelineFeedCard.displayName = "TimelineFeedCard";

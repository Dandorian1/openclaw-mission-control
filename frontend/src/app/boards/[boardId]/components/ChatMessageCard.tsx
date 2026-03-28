"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/atoms/Markdown";
import { resolveHumanActorName } from "@/lib/display-name";
import type { BoardChatMessage, MessageUsage } from "../board-types";
import { formatShortTimestamp } from "../board-utils";

export const ChatMessageCard = memo(function ChatMessageCard({
  message,
  fallbackSource,
  showMetadata = false,
  sessionModel,
}: {
  message: BoardChatMessage;
  fallbackSource: string;
  showMetadata?: boolean;
  sessionModel?: string;
}) {
  const sourceLabel = resolveHumanActorName(message.source, fallbackSource);
  const usage = (message as BoardChatMessage & { usage?: MessageUsage }).usage;

  return (
    <div className={cn("chat-msg-group", showMetadata && "chat-msg-group--meta-always")}>
      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-strong">{sourceLabel}</p>
          <span className="text-xs text-quiet">
            {formatShortTimestamp(message.created_at)}
          </span>
        </div>
        <div className="mt-2 select-text cursor-text text-sm leading-relaxed text-strong break-words">
          <Markdown content={message.content} variant="basic" />
        </div>
        {usage ? (
          <div className="chat-msg-meta mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <span
              className="cursor-help"
              title={`Input: ${usage.input_tokens.toLocaleString()} tokens · Output: ${usage.output_tokens.toLocaleString()} tokens`}
            >
              {(usage.input_tokens + usage.output_tokens).toLocaleString()} tokens
            </span>
            {usage.cost != null ? (
              <span
                className="cursor-help text-[color:var(--success)]"
                title="Estimated cost for this message (input + output tokens at current model pricing)"
              >
                ${usage.cost.toFixed(4)}
              </span>
            ) : null}
            {usage.context_pct != null ? (
              <span
                className={cn(
                  "cursor-help",
                  usage.context_pct >= 90
                    ? "text-[color:var(--danger)]"
                    : usage.context_pct >= 70
                      ? "text-[color:var(--warning)]"
                      : "text-quiet",
                )}
                title={`Context window usage: ${usage.context_pct}% of model limit consumed`}
              >
                {usage.context_pct}% ctx
              </span>
            ) : null}
            {usage.model && usage.model !== sessionModel ? (
              <span className="rounded bg-[color:var(--surface-strong)] px-1.5 py-0.5 font-mono">
                {usage.model}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

ChatMessageCard.displayName = "ChatMessageCard";

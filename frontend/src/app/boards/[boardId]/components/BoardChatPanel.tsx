"use client";

import { memo, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoardChatComposer } from "@/components/BoardChatComposer";
import { ChatMessageCard } from "./ChatMessageCard";
import type { BoardChatMessage } from "../board-types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChatSessionStats {
  totalTokens: number;
  totalCost: number;
}

export interface BoardChatPanelProps {
  /** Whether the slide-over panel is visible. */
  isOpen: boolean;
  /** Close handler (removes URL param + hides panel). */
  onClose: () => void;

  /* ── Messages ─────────────────────────────────────────────────────────── */
  chatMessages: BoardChatMessage[];
  chatError: string | null;

  /* ── Send ──────────────────────────────────────────────────────────────── */
  isSending: boolean;
  onSend: (content: string) => Promise<boolean>;

  /* ── Metadata toggle ──────────────────────────────────────────────────── */
  showMetadata: boolean;
  onToggleMetadata: () => void;
  sessionStats: ChatSessionStats | null;

  /* ── Mention autocomplete ─────────────────────────────────────────────── */
  mentionSuggestions: string[];

  /* ── Access / display ─────────────────────────────────────────────────── */
  canWrite: boolean;
  currentUserDisplayName: string;

  /** Ref placed at the bottom of the message list for auto-scroll. */
  chatEndRef: RefObject<HTMLDivElement | null>;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export const BoardChatPanel = memo(function BoardChatPanel({
  isOpen,
  onClose,
  chatMessages,
  chatError,
  isSending,
  onSend,
  showMetadata,
  onToggleMetadata,
  sessionStats,
  mentionSuggestions,
  canWrite,
  currentUserDisplayName,
  chatEndRef,
}: BoardChatPanelProps) {
  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-full max-w-[96vw] transform border-l border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl transition-transform md:w-[560px]",
        isOpen ? "transform-none" : "translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3 md:px-6 md:py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Board chat
            </p>
            <p className="mt-1 text-sm font-medium text-strong">
              Talk to the lead agent. Tag others with @name.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[color:var(--border)] p-2 text-muted transition hover:bg-[color:var(--surface-muted)]"
            aria-label="Close board chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
          {/* Metadata toggle bar */}
          <div className="mb-2 flex items-center justify-between border-b border-[color:var(--border)] pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Board Chat
            </span>
            <div className="flex items-center gap-3">
              {showMetadata && sessionStats ? (
                <span className="text-xs text-quiet">
                  Session: {sessionStats.totalTokens.toLocaleString()} tokens
                  {" · "}
                  ${sessionStats.totalCost.toFixed(4)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onToggleMetadata}
                className="text-xs text-muted transition-colors hover:text-strong"
              >
                {showMetadata ? "Hide metadata" : "Show metadata"}
              </button>
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            {chatError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {chatError}
              </div>
            ) : null}
            {chatMessages.length === 0 ? (
              <p className="text-sm text-muted">
                No messages yet. Start the conversation with your lead agent.
              </p>
            ) : (
              chatMessages.map((message) => (
                <ChatMessageCard
                  key={message.id}
                  message={message}
                  fallbackSource={currentUserDisplayName}
                  showMetadata={showMetadata}
                />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Composer */}
          <BoardChatComposer
            isSending={isSending}
            onSend={onSend}
            disabled={!canWrite}
            mentionSuggestions={mentionSuggestions}
            placeholder={
              canWrite
                ? "Message the board lead. Tag agents with @name."
                : "Read-only access. Chat is disabled."
            }
          />
        </div>
      </div>
    </aside>
  );
});

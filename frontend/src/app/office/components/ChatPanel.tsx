"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import type { AgentRead, BoardRead, BoardGroupMemoryRead } from "@/api/generated/model";
import {
  listBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryGet,
  createBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryPost,
} from "@/api/generated/board-group-memory/board-group-memory";
import { timeAgo } from "./helpers";

export function ChatPanel({
  onClose,
  agents,
  boards,
}: {
  onClose: () => void;
  agents: AgentRead[];
  boards: BoardRead[];
}) {
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<BoardGroupMemoryRead[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) {
      setSelectedBoardId(boards[0]!.id);
    }
  }, [boards, selectedBoardId]);

  const loadMessages = useCallback(async () => {
    if (!selectedBoardId) return;
    const contextBoardId = selectedBoardId === "__all__" ? boards[0]?.id : selectedBoardId;
    if (!contextBoardId) return;
    try {
      const res = await listBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryGet(
        contextBoardId,
        { is_chat: true, limit: 100 },
      );
      if (res.status === 200) {
        const items = (res.data as { items?: BoardGroupMemoryRead[] })?.items ?? [];
        const sorted = [...items].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        setChatMessages(sorted);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [selectedBoardId, boards]);

  useEffect(() => {
    setIsLoading(true);
    setChatMessages([]);
    void loadMessages();
    pollRef.current = setInterval(() => void loadMessages(), 5_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages.length]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !selectedBoardId || isSending) return;
    const contextBoardId = selectedBoardId === "__all__" ? boards[0]?.id : selectedBoardId;
    if (!contextBoardId) return;
    setIsSending(true);
    try {
      const res = await createBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryPost(
        contextBoardId,
        { content: message.trim(), tags: ["chat", "office-meeting"], source: "Office Meeting" },
      );
      if (res.status === 200) {
        setMessage("");
        void loadMessages();
      }
    } catch {
      // silent
    } finally {
      setIsSending(false);
    }
  }, [message, selectedBoardId, isSending, loadMessages, boards]);

  return (
    <div className="flex h-full flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)]">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <MessageCircle className="h-3.5 w-3.5" />
          Office Chat
        </h3>
        <button onClick={onClose} className="text-muted hover:text-strong transition">
          <X className="h-4 w-4" />
        </button>
      </div>

      {boards.length > 0 && (
        <div className="border-b border-[color:var(--border)] px-4 py-2">
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-1 text-[11px] text-strong"
          >
            {boards.length > 1 && <option value="__all__">✦ All Boards</option>}
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="space-y-2 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[color:var(--surface-strong)]" />
            ))}
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted">
            <MessageCircle className="h-6 w-6 opacity-30 mb-2" />
            <p className="text-[11px]">No messages yet</p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div key={msg.id} className="rounded-lg bg-[color:var(--surface-muted)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-strong">{msg.source ?? "Unknown"}</span>
                <span className="text-[9px] text-muted">{timeAgo(msg.created_at)}</span>
              </div>
              <p className="text-xs text-strong mt-0.5 whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[color:var(--border)] p-3">
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Type a message..."
            disabled={isSending}
            className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1.5 text-xs text-strong placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isSending || !message.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {isSending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

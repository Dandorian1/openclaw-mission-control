"use client";

import { memo } from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "./helpers";

const EVENT_DOT: Record<string, string> = {
  join: "bg-emerald-500",
  task_start: "bg-blue-500",
  task_complete: "bg-emerald-500",
  system: "bg-gray-400",
  error: "bg-rose-500",
};

function dotColor(type: string): string {
  for (const [key, color] of Object.entries(EVENT_DOT)) {
    if (type.includes(key)) return color;
  }
  if (type.includes("comment")) return "bg-blue-500";
  if (type.includes("done") || type.includes("complete")) return "bg-emerald-500";
  if (type.includes("error")) return "bg-rose-500";
  return "bg-gray-400";
}

export const ActivityPanel = memo(function ActivityPanel({
  events,
  isLoading,
  collapsed,
  onToggle,
}: {
  events: Array<{ id: string; event_type: string; message: string; created_at: string }>;
  isLoading: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="flex h-full w-10 flex-col items-center justify-center border-l border-[color:var(--border)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-muted)] transition"
        title="Show activity panel"
      >
        <Activity className="h-4 w-4 text-muted" />
        <span className="mt-1 text-[9px] text-muted [writing-mode:vertical-rl]">ACTIVITY</span>
      </button>
    );
  }

  return (
    <div className="flex h-full w-[280px] flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          Live Activity
        </h3>
        {onToggle && (
          <button onClick={onToggle} className="text-muted hover:text-strong text-[10px]" title="Collapse">
            ✕
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto" aria-live="polite">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-[color:var(--surface-strong)]" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <Activity className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-xs">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--border)]">
            {events.slice(0, 20).map((event) => (
              <div key={event.id} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotColor(event.event_type))} />
                  <div className="min-w-0">
                    <p className="text-xs text-strong line-clamp-2">{event.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{timeAgo(event.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {events.length > 0 && (
        <div className="border-t border-[color:var(--border)] px-4 py-2">
          <button className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
            View All →
          </button>
        </div>
      )}
    </div>
  );
});

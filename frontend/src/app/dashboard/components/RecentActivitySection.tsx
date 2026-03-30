"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  MessageSquare,
  Play,
  Settings,
  Shield,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/components/atoms/Markdown";
import { formatRelativeTimestamp, formatTimestamp } from "@/lib/formatters";
import type { ActivityEventRead } from "@/api/generated/model";

interface RecentActivitySectionProps {
  events: ActivityEventRead[];
  buildHref: (event: ActivityEventRead) => string;
}

const eventTypeIcon: Record<string, { icon: typeof Check; color: string }> = {
  "task.completed": { icon: Check, color: "text-emerald-500" },
  "task.done": { icon: Check, color: "text-emerald-500" },
  "task.started": { icon: Play, color: "text-blue-500" },
  "task.in_progress": { icon: Play, color: "text-blue-500" },
  "task.moved": { icon: ArrowRight, color: "text-slate-400" },
  "task.comment": { icon: MessageSquare, color: "text-blue-500" },
  "approval.requested": { icon: AlertTriangle, color: "text-amber-500" },
  "system": { icon: Settings, color: "text-slate-400" },
  "error": { icon: XCircle, color: "text-red-500" },
};

function EventIcon({ eventType }: { eventType: string }) {
  const match = eventTypeIcon[eventType];
  if (match) {
    const Icon = match.icon;
    return <Icon className={`h-3.5 w-3.5 ${match.color}`} />;
  }
  return <Activity className="h-3.5 w-3.5 text-slate-400" />;
}

export function RecentActivitySection({ events, buildHref }: RecentActivitySectionProps) {
  const router = useRouter();

  const shouldIgnore = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("a"));
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>, href: string) => {
    if (shouldIgnore(e.target)) return;
    router.push(href);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, href: string) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (shouldIgnore(e.target)) return;
    e.preventDefault();
    router.push(href);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm md:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-strong">Recent Activity</h3>
        <Link
          href="/activity"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-strong"
        >
          View Full Activity
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="max-h-[400px] space-y-2 overflow-x-hidden overflow-y-auto pr-1" role="feed" aria-busy={false}>
        {events.length > 0 ? (
          events.map((event) => {
            const href = buildHref(event);
            return (
              <div
                key={event.id}
                role="link"
                tabIndex={0}
                aria-label={`Open related context for ${event.event_type} activity`}
                onClick={(e) => handleClick(e, href)}
                onKeyDown={(e) => handleKeyDown(e, href)}
                className="cursor-pointer overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-muted)] focus-visible:border-[color:var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1 shrink-0">
                    <EventIcon eventType={event.event_type} />
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="break-words text-sm font-medium text-strong [&_ol]:mb-0 [&_p]:mb-0 [&_pre]:my-1 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:mb-0">
                      <Markdown
                        content={event.message?.trim() || event.event_type}
                        variant="comment"
                      />
                    </div>
                    <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">
                      {event.event_type}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted">
                    <p>{formatRelativeTimestamp(event.created_at)}</p>
                    <p>{formatTimestamp(event.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] text-sm text-muted">
            <Shield className="mb-2 h-5 w-5 text-quiet" />
            No activity yet
            <p className="mt-1 text-xs text-muted">
              Activity appears here when events are emitted.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

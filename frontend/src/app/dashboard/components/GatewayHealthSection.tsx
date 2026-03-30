"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

type SummaryRow = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
};

interface GatewayHealthSectionProps {
  statusLabel: string;
  badgeTone: "online" | "offline" | "neutral";
  rows: SummaryRow[];
  isLoading?: boolean;
}

const statusDotColor: Record<string, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  neutral: "bg-amber-500",
};

const statusBadgeClasses: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  offline: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  neutral: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

const toneTextColor: Record<string, string> = {
  default: "text-strong",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

export function GatewayHealthSection({
  statusLabel,
  badgeTone,
  rows,
  isLoading,
}: GatewayHealthSectionProps) {
  // Collapsed by default when connected, expanded when not
  const [isExpanded, setIsExpanded] = useState(badgeTone !== "online");

  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-4 md:px-6"
        aria-expanded={isExpanded}
        aria-controls="gateway-health-details"
      >
        <h3 className="text-lg font-semibold text-strong">Gateway Health</h3>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses[badgeTone] ?? statusBadgeClasses.neutral}`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${statusDotColor[badgeTone] ?? statusDotColor.neutral}`}
            />
            {statusLabel}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </div>
      </button>

      <div
        id="gateway-health-details"
        className={`overflow-hidden transition-all duration-200 ease-out ${
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-[color:var(--border)] px-4 py-4 md:px-6">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-[color:var(--surface-muted)]" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className={`font-medium ${toneTextColor[row.tone ?? "default"]}`}>
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="pt-2">
                <Link
                  href="/settings"
                  className="text-xs text-[color:var(--accent)] hover:underline"
                >
                  Edit Configuration
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

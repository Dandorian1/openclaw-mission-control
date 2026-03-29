import * as React from "react";
import { Inbox, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty state component for list views, search results, etc.
 * Provides visual and textual feedback when no content is available.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon to display (LucideReact component) */
  icon?: React.ReactNode;
  /** Main heading */
  title: string;
  /** Descriptive text */
  description?: string;
  /** Optional action element (button, etc) */
  action?: React.ReactNode;
  /** Type of empty state */
  type?: "default" | "search" | "error";
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      icon,
      title,
      description,
      action,
      type = "default",
      ...props
    },
    ref,
  ) => {
    // Default icons per type
    let defaultIcon = icon;
    if (!defaultIcon) {
      if (type === "search") defaultIcon = <Search className="h-12 w-12" />;
      if (type === "error") defaultIcon = <AlertCircle className="h-12 w-12" />;
      if (type === "default") defaultIcon = <Inbox className="h-12 w-12" />;
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-8 text-center",
          type === "error" && "bg-[rgba(220,38,38,0.05)]",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "rounded-full p-3",
            type === "default" && "bg-[color:var(--surface)]",
            type === "search" && "bg-[color:var(--surface)]",
            type === "error" && "bg-[rgba(220,38,38,0.1)] text-[color:var(--danger)]",
          )}
        >
          {defaultIcon}
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-[color:var(--text)]">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-[color:var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  },
);
EmptyState.displayName = "EmptyState";

/**
 * No results empty state — specific for search/filter scenarios.
 */
export function NoResults({ query }: { query?: string }) {
  return (
    <EmptyState
      type="search"
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}". Try a different search.`
          : "No items match your filters."
      }
    />
  );
}

/**
 * Error empty state — for error/failure scenarios.
 */
export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <EmptyState
      type="error"
      title={title}
      description={description}
      action={action}
    />
  );
}

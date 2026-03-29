import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Standalone spinner — use inline or as a building block.
 */
export function LoadingSpinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-4 w-4 border",
    md: "h-6 w-6 border-2",
    lg: "h-10 w-10 border-2",
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-spin rounded-full border-[color:var(--border)] border-t-[color:var(--accent)]",
        sizeClasses[size],
        className,
      )}
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Loading state component — spinner + optional message.
 * Use for section-level or page-level loading indicators.
 */
export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of spinner */
  size?: "sm" | "md" | "lg";
  /** Loading message */
  message?: string;
  /** Center vertically in a tall container */
  fullPage?: boolean;
}

export const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ className, size = "md", message = "Loading…", fullPage = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center gap-3",
          fullPage && "min-h-[400px]",
          !fullPage && "py-8",
          className,
        )}
        {...props}
      >
        <LoadingSpinner size={size} />
        {message && (
          <p className="text-sm text-[color:var(--text-muted)]">{message}</p>
        )}
      </div>
    );
  },
);
LoadingState.displayName = "LoadingState";

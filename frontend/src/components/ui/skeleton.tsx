import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton loader — animated placeholder for loading content.
 * Use while fetching data to provide visual feedback.
 */
const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-md bg-[color:var(--surface-muted)] animate-pulse",
      className,
    )}
    {...props}
  />
));
Skeleton.displayName = "Skeleton";

/**
 * Skeleton card — placeholder for list items, cards, etc.
 */
export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-2xl bg-[color:var(--surface)] p-4 shadow-card">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/**
 * Skeleton text — placeholder for text content.
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton form — placeholder for form inputs.
 */
export function SkeletonForm() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-28 w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-24" />
      </div>
    </div>
  );
}

/**
 * Skeleton list — placeholder for multiple list items.
 */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-[color:var(--border)] p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export { Skeleton };

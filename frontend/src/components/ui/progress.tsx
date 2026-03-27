"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-strong)]",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-[color:var(--accent)] transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

/**
 * Stepper component for multi-step processes.
 */
export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current active step (0-indexed) */
  current: number;
  /** Total number of steps */
  total: number;
  /** Step labels */
  labels?: string[];
  /** Whether to show step labels */
  showLabels?: boolean;
}

export const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  (
    { className, current, total, labels, showLabels = true, ...props },
    ref,
  ) => {
    return (
      <div ref={ref} className={cn("w-full space-y-4", className)} {...props}>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {Array.from({ length: total }).map((_, i) => (
            <React.Fragment key={i}>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full font-semibold transition-all",
                  i <= current
                    ? "bg-[color:var(--accent)] text-white"
                    : "bg-[color:var(--surface-strong)] text-[color:var(--text-muted)]",
                )}
              >
                {i + 1}
              </div>
              {i < total - 1 && (
                <div
                  className={cn(
                    "flex-1 h-1 rounded-full transition-all",
                    i < current
                      ? "bg-[color:var(--accent)]"
                      : "bg-[color:var(--surface-strong)]",
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Labels */}
        {showLabels && labels && (
          <div className="flex justify-between text-xs font-medium text-[color:var(--text-muted)]">
            {labels.map((label, i) => (
              <span
                key={i}
                className={cn(
                  i <= current && "text-[color:var(--text)]",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
);
Stepper.displayName = "Stepper";

export { Progress };

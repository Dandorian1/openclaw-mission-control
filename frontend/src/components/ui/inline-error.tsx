import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Inline error banner — lightweight error message for form/section-level errors.
 * Uses design tokens instead of hardcoded Tailwind colors.
 *
 * For full-page error states with icon + title, use `ErrorState` from `empty-state.tsx`.
 */
export interface InlineErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Error message to display */
  message: string;
  /** Size variant */
  size?: "sm" | "md";
}

export const InlineError = React.forwardRef<HTMLDivElement, InlineErrorProps>(
  ({ className, message, size = "md", ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "rounded-lg border border-[color:var(--danger)] bg-[rgba(220,38,38,0.05)] text-[color:var(--danger)]",
          "dark:bg-[rgba(248,113,113,0.08)]",
          size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
          className,
        )}
        {...props}
      >
        {message}
      </div>
    );
  },
);
InlineError.displayName = "InlineError";

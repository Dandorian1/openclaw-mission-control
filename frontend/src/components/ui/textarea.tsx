import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** When true, applies a red border and focus-ring and sets aria-invalid. */
  hasError?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={hasError || undefined}
      className={cn(
        "flex min-h-[100px] w-full rounded-xl border bg-[color:var(--surface)] px-4 py-3 text-sm text-strong shadow-sm resize-vertical focus-visible:outline-none focus-visible:ring-2",
        hasError
          ? "border-[color:var(--danger)] focus-visible:ring-[color:var(--danger)]"
          : "border-[color:var(--border)] focus-visible:ring-[color:var(--accent)]",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };

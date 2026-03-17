import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** When true, applies a red border and focus-ring and sets aria-invalid. */
  hasError?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, hasError, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={hasError || undefined}
      className={cn(
        "flex h-11 w-full rounded-xl border bg-[color:var(--surface)] px-4 text-sm text-strong shadow-sm focus-visible:outline-none focus-visible:ring-2",
        hasError
          ? "border-[color:var(--danger)] focus-visible:ring-[color:var(--danger)]"
          : "border-[color:var(--border)] focus-visible:ring-[color:var(--accent)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, Check, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--accent)] text-white shadow-sm hover:bg-[color:var(--accent-strong)]",
        secondary:
          "border border-[color:var(--border)] bg-[color:var(--surface)] text-strong hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]",
        outline:
          "border border-[color:var(--border-strong)] bg-transparent text-strong hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]",
        ghost:
          "bg-transparent text-strong hover:bg-[color:var(--surface-strong)]",
        destructive:
          "bg-[color:var(--danger)] text-white shadow-sm hover:opacity-90 focus-visible:ring-[color:var(--danger)]",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-5",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Loading state: shows spinner and disables interaction */
  isLoading?: boolean;
  /** Success state: shows checkmark briefly, then callback */
  isSuccess?: boolean;
  /** Error state: shows error icon */
  isError?: boolean;
  /** Label to show during loading */
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading = false,
      isSuccess = false,
      isError = false,
      loadingLabel,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    // Determine what to show
    const showLoading = isLoading && !isSuccess && !isError;
    const showSuccess = isSuccess && !isError;
    const showError = isError;

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading || showSuccess}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {showLoading && (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingLabel || "Loading..."}
          </>
        )}
        {showSuccess && (
          <>
            <Check className="h-4 w-4" />
            Success
          </>
        )}
        {showError && (
          <>
            <AlertCircle className="h-4 w-4" />
            {children}
          </>
        )}
        {!showLoading && !showSuccess && !showError && children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

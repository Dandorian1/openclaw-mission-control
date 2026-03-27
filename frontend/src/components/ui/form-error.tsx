import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Form error message component.
 * Shows inline validation errors with icon.
 */
export interface FormErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Error message to display */
  message?: string;
  /** Type of feedback: error, success, or info */
  type?: "error" | "success" | "info";
}

export const FormError = React.forwardRef<HTMLDivElement, FormErrorProps>(
  ({ className, message, type = "error", ...props }, ref) => {
    if (!message) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-2 text-xs font-medium",
          type === "error" && "text-[color:var(--danger)]",
          type === "success" && "text-[color:var(--success)]",
          type === "info" && "text-[color:var(--text-muted)]",
          className,
        )}
        {...props}
      >
        {type === "error" && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
        {type === "success" && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
        {message}
      </div>
    );
  },
);
FormError.displayName = "FormError";

/**
 * Form field wrapper with label, input, and error support.
 */
export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Field label */
  label?: string;
  /** Whether field is required */
  required?: boolean;
  /** Help text below label */
  helpText?: string;
  /** Error message */
  error?: string;
  /** Success message */
  success?: string;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    { className, label, required, helpText, error, success, children, ...props },
    ref,
  ) => (
    <div ref={ref} className={cn("space-y-1.5", className)} {...props}>
      {label && (
        <label className="text-sm font-medium text-[color:var(--text)]">
          {label}
          {required && <span className="text-[color:var(--danger)]"> *</span>}
        </label>
      )}
      {helpText && !error && !success && (
        <p className="text-xs text-[color:var(--text-muted)]">{helpText}</p>
      )}
      {children}
      {error && <FormError message={error} type="error" />}
      {success && <FormError message={success} type="success" />}
    </div>
  ),
);
FormField.displayName = "FormField";

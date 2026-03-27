"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-5 w-5 shrink-0 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] ring-offset-[color:var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[color:var(--accent)] data-[state=checked]:border-[color:var(--accent)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-white")}
    >
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

/**
 * Checkbox group for multiple selections.
 */
export interface CheckboxGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Label for the group */
  label?: string;
  /** Items to render as checkboxes */
  items: Array<{ id: string; label: string; disabled?: boolean }>;
  /** Selected item IDs */
  value?: string[];
  /** Change handler */
  onValueChange?: (value: string[]) => void;
  /** Error message */
  error?: string;
}

export const CheckboxGroup = React.forwardRef<
  HTMLDivElement,
  CheckboxGroupProps
>(({ className, label, items, value = [], onValueChange, error, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-2", className)} {...props}>
    {label && (
      <label className="text-sm font-medium text-[color:var(--text)]">
        {label}
      </label>
    )}
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Checkbox
            id={item.id}
            checked={value.includes(item.id)}
            onCheckedChange={(checked) => {
              onValueChange?.(
                checked
                  ? [...value, item.id]
                  : value.filter((v) => v !== item.id),
              );
            }}
            disabled={item.disabled}
          />
          <label
            htmlFor={item.id}
            className="text-sm font-medium text-[color:var(--text)] cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          >
            {item.label}
          </label>
        </div>
      ))}
    </div>
    {error && (
      <p className="text-xs text-[color:var(--danger)]">{error}</p>
    )}
  </div>
));
CheckboxGroup.displayName = "CheckboxGroup";

export { Checkbox };

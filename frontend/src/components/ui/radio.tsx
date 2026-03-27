"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    className={cn("grid gap-2", className)}
    {...props}
    ref={ref}
  />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-5 w-5 rounded-full border border-[color:var(--border)] text-[color:var(--accent)] ring-offset-[color:var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="h-3.5 w-3.5 fill-current text-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

/**
 * Radio group for single selection from multiple options.
 */
export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Label for the group */
  label?: string;
  /** Items to render as radio buttons */
  items: Array<{ id: string; label: string; disabled?: boolean }>;
  /** Selected item ID */
  value?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Help text */
  helpText?: string;
}

export const RadioGroupWithLabel = React.forwardRef<
  HTMLDivElement,
  RadioGroupProps
>(({ className, label, items, value, onValueChange, helpText, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-2", className)} {...props}>
    {label && (
      <label className="text-sm font-medium text-[color:var(--text)]">
        {label}
      </label>
    )}
    <RadioGroup value={value} onValueChange={onValueChange}>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <RadioGroupItem value={item.id} id={item.id} disabled={item.disabled} />
          <label
            htmlFor={item.id}
            className="text-sm font-medium text-[color:var(--text)] cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          >
            {item.label}
          </label>
        </div>
      ))}
    </RadioGroup>
    {helpText && (
      <p className="text-xs text-[color:var(--text-muted)]">{helpText}</p>
    )}
  </div>
));
RadioGroupWithLabel.displayName = "RadioGroupWithLabel";

export { RadioGroup, RadioGroupItem };

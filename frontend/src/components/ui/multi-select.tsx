"use client";

import * as React from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select dropdown component.
 * Displays selected items as badges in the trigger, with a popover list for selection.
 */
export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
    .filter(Boolean);

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onValueChange(value.filter((v) => v !== optionValue));
    } else {
      onValueChange([...value, optionValue]);
    }
  };

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(value.filter((v) => v !== optionValue));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-h-[2.75rem] w-full items-center gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          {value.length === 0 ? (
            <span className="text-[color:var(--text-quiet)]">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((v) => {
                const label = options.find((o) => o.value === v)?.label ?? v;
                return (
                  <Badge key={v} variant="accent" className="gap-1 pr-1">
                    {label}
                    <button
                      type="button"
                      onClick={(e) => handleRemove(v, e)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-[rgba(0,0,0,0.1)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-1" align="start">
        <div className="max-h-60 overflow-y-auto">
          {options.map((option) => {
            const isSelected = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors hover:bg-[color:var(--surface-muted)]",
                  isSelected && "bg-[color:var(--accent-soft)]",
                )}
                onClick={() => handleToggle(option.value)}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border",
                    isSelected
                      ? "bg-[color:var(--accent)] border-[color:var(--accent)] text-white"
                      : "border-[color:var(--border)]",
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                {option.label}
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="p-2 text-xs text-[color:var(--text-muted)]">No options available</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

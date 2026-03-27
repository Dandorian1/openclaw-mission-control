"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Calendar component for date selection.
 * Supports keyboard navigation (arrows, home, end, page up/down for month navigation).
 */
export interface CalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Selected date */
  value?: Date;
  /** Change handler */
  onValueChange?: (date: Date) => void;
  /** Minimum date */
  minDate?: Date;
  /** Maximum date */
  maxDate?: Date;
  /** Show range selection */
  range?: boolean;
}

export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  (
    {
      className,
      value,
      onValueChange,
      minDate,
      maxDate,
      range = false,
      ...props
    },
    ref,
  ) => {
    const [month, setMonth] = React.useState(value?.getMonth() ?? new Date().getMonth());
    const [year, setYear] = React.useState(value?.getFullYear() ?? new Date().getFullYear());

    // Get days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => null);

    const isDisabled = (day: number) => {
      const date = new Date(year, month, day);
      if (minDate && date < minDate) return true;
      if (maxDate && date > maxDate) return true;
      return false;
    };

    const isSelected = (day: number) => {
      if (!value) return false;
      return (
        day === value.getDate() &&
        month === value.getMonth() &&
        year === value.getFullYear()
      );
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!value) return;

      const date = new Date(value);
      switch (e.key) {
        case "ArrowLeft":
          date.setDate(date.getDate() - 1);
          break;
        case "ArrowRight":
          date.setDate(date.getDate() + 1);
          break;
        case "Home":
          date.setDate(1);
          break;
        case "End":
          date.setDate(daysInMonth);
          break;
        case "PageUp":
          date.setMonth(date.getMonth() - 1);
          break;
        case "PageDown":
          date.setMonth(date.getMonth() + 1);
          break;
        default:
          return;
      }

      if (!isDisabled(date.getDate())) {
        setMonth(date.getMonth());
        setYear(date.getFullYear());
        onValueChange?.(date);
      }
      e.preventDefault();
    };

    return (
      <div
        ref={ref}
        className={cn("p-4 space-y-4", className)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        {...props}
      >
        {/* Month/Year header */}
        <div className="flex items-center justify-between gap-2">
          <button
            className="p-1 hover:bg-[color:var(--surface-muted)] rounded"
            onClick={() => setMonth(month === 0 ? 11 : month - 1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold">
            {new Date(year, month).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            className="p-1 hover:bg-[color:var(--surface-muted)] rounded"
            onClick={() => setMonth(month === 11 ? 0 : month + 1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {/* Day labels */}
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <div key={day} className="font-semibold text-[color:var(--text-muted)]">
              {day}
            </div>
          ))}

          {/* Blank days + calendar days */}
          {blanks.map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((day) => (
            <button
              key={day}
              onClick={() => {
                const date = new Date(year, month, day);
                onValueChange?.(date);
              }}
              disabled={isDisabled(day)}
              className={cn(
                "h-8 rounded-md text-sm font-medium transition-colors",
                isSelected(day)
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[color:var(--text)] hover:bg-[color:var(--surface-muted)]",
                isDisabled(day) && "opacity-50 cursor-not-allowed",
              )}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
    );
  },
);
Calendar.displayName = "Calendar";

/**
 * DatePicker component — popover-based date selection.
 */
export interface DatePickerProps extends React.HTMLAttributes<HTMLButtonElement> {
  /** Selected date value */
  value?: Date;
  /** Change handler */
  onValueChange?: (date: Date) => void;
}

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);

    const formattedDate = value?.toLocaleDateString();

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            {...props}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            {formattedDate || "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            value={value}
            onValueChange={(date) => {
              onValueChange?.(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
DatePicker.displayName = "DatePicker";

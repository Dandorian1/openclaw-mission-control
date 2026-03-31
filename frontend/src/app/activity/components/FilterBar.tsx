"use client";

import { cn } from "@/lib/utils";
import type { FilterCategory } from "./types";
import { FILTER_CATEGORIES } from "./helpers";

interface FilterBarProps {
  activeFilters: Set<FilterCategory>;
  onToggleFilter: (category: FilterCategory) => void;
  boardFilter: string | null;
  boards: { id: string; name: string }[];
  onBoardFilterChange: (boardId: string | null) => void;
}

export function FilterBar({
  activeFilters,
  onToggleFilter,
  boardFilter,
  boards,
  onBoardFilterChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Event type pills */}
      {FILTER_CATEGORIES.map((cat) => {
        const isActive = activeFilters.has(cat.key);
        return (
          <button
            key={cat.key}
            onClick={() => onToggleFilter(cat.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-[color:var(--accent)] bg-[color:var(--accent-soft,rgba(99,102,241,0.1))] text-[color:var(--accent,#6366f1)]"
                : "border-[color:var(--border)] bg-[color:var(--surface)] text-muted hover:bg-[color:var(--surface-muted)]",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", cat.color)} />
            {cat.label}
          </button>
        );
      })}

      {/* Board filter dropdown */}
      {boards.length > 1 ? (
        <select
          value={boardFilter ?? ""}
          onChange={(e) =>
            onBoardFilterChange(e.target.value || null)
          }
          className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-medium text-muted outline-none transition hover:bg-[color:var(--surface-muted)]"
        >
          <option value="">All boards</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const Pagination = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <nav
    role="navigation"
    aria-label="Pagination Navigation"
    className={cn("flex w-full justify-center", className)}
    {...props}
  />
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & React.ComponentPropsWithoutRef<typeof Button>;

const PaginationLink = ({
  className,
  isActive,
  size = "sm",
  ...props
}: PaginationLinkProps) => (
  <Button
    aria-current={isActive ? "page" : undefined}
    variant={isActive ? "primary" : "outline"}
    className={cn("h-9 w-9 p-0", className)}
    size={size}
    {...props}
  />
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to previous page"
    size="sm"
    className={cn("gap-1 pr-2.5", className)}
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to next page"
    size="sm"
    className={cn("gap-1 pl-2.5", className)}
    {...props}
  >
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4 text-[color:var(--text-muted)]" />
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

/**
 * Pagination control hook.
 * Usage: const { page, pageSize, setPage, totalPages, canPrev, canNext } = usePagination(items, pageSize)
 */
export function usePagination({
  items,
  pageSize = 10,
}: {
  items: any[];
  pageSize?: number;
}) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.ceil(items.length / pageSize);

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedItems = items.slice(start, end);

  return {
    page,
    setPage,
    pageSize,
    totalPages,
    canPrev: page > 1,
    canNext: page < totalPages,
    paginatedItems,
    goFirst: () => setPage(1),
    goLast: () => setPage(totalPages),
  };
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};

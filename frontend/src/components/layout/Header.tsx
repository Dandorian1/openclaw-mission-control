"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Page header component with consistent styling and spacing.
 * Used at the top of main content areas.
 */
export interface HeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional left content (logo, title) */
  leftContent?: React.ReactNode;
  /** Optional right content (actions, theme toggle) */
  rightContent?: React.ReactNode;
  /** Whether to show a bottom border */
  bordered?: boolean;
}

export const Header = React.forwardRef<HTMLDivElement, HeaderProps>(
  ({ className, leftContent, rightContent, bordered = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between px-6 py-4",
        bordered && "border-b border-[color:var(--border)]",
        className,
      )}
      {...props}
    >
      {leftContent}
      {children}
      {rightContent}
    </div>
  ),
);
Header.displayName = "Header";

/**
 * Main content area wrapper.
 */
export interface MainProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width constraint */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
  /** Whether to add padding */
  padded?: boolean;
}

export const Main = React.forwardRef<HTMLDivElement, MainProps>(
  ({ className, maxWidth = "full", padded = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex-1",
        padded && "px-6 py-6",
        maxWidth === "sm" && "max-w-2xl mx-auto",
        maxWidth === "md" && "max-w-4xl mx-auto",
        maxWidth === "lg" && "max-w-6xl mx-auto",
        maxWidth === "xl" && "max-w-7xl mx-auto",
        className,
      )}
      {...props}
    />
  ),
);
Main.displayName = "Main";

/**
 * Sidebar + content layout container.
 */
export interface LayoutContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Sidebar component */
  sidebar?: React.ReactNode;
  /** Whether sidebar is on right (default: left) */
  sidebarPosition?: "left" | "right";
  /** Sidebar width (default: w-64) */
  sidebarWidth?: string;
}

export const LayoutContainer = React.forwardRef<HTMLDivElement, LayoutContainerProps>(
  ({ className, sidebar, sidebarPosition = "left", sidebarWidth = "w-64", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex h-screen flex-col bg-[color:var(--bg)]", className)}
      {...props}
    >
      <div className="flex flex-1 overflow-hidden">
        {sidebar && sidebarPosition === "left" && (
          <aside className={cn(sidebarWidth, "border-r border-[color:var(--border)] bg-[color:var(--surface)] overflow-y-auto")}>
            {sidebar}
          </aside>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
        {sidebar && sidebarPosition === "right" && (
          <aside className={cn(sidebarWidth, "border-l border-[color:var(--border)] bg-[color:var(--surface)] overflow-y-auto")}>
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  ),
);
LayoutContainer.displayName = "LayoutContainer";

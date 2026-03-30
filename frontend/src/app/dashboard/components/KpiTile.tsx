"use client";

import type { ReactNode } from "react";

interface KpiTileProps {
  label: string;
  value: string;
  secondary: string;
  icon: ReactNode;
  href?: string;
}

export function KpiTile({ label, value, secondary, icon, href }: KpiTileProps) {
  const content = (
    <div className="group relative flex h-[120px] flex-col justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-none dark:hover:shadow-none cursor-pointer">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]">
          {icon}
        </span>
      </div>
      <div>
        <p className="text-[40px] font-bold leading-none text-strong">{value}</p>
        <p className="mt-1 text-xs text-muted">{secondary}</p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }

  return content;
}

"use client";

import { useAuth, useUser } from "@/auth/clerk";

export function HeroHeader() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const firstName = (user as { firstName?: string } | null)?.firstName;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="mb-6 rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] px-8 py-8 text-center">
      <h1 className="text-[28px] font-semibold tracking-tight text-strong">
        Welcome back{isSignedIn && firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {dateStr} &middot; {timeStr}
      </p>
    </div>
  );
}

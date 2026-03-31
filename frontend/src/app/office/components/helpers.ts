import type { AgentRead } from "@/api/generated/model";

export function agentActivity(agent: AgentRead): "active" | "idle" | "offline" {
  if (agent.status === "online") return "active";
  if (!agent.last_seen_at) return "offline";
  const diff = Date.now() - new Date(agent.last_seen_at).getTime();
  if (diff < 5 * 60_000) return "active";
  if (diff < 30 * 60_000) return "idle";
  return "offline";
}

export const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-gray-400",
};

export const AGENT_EMOJIS = ["💻", "🖥️", "⌨️", "🔧", "🛡️", "🎨", "📊", "🔬", "📱", "🤖"];

export const PILL_COLORS = [
  "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  "bg-purple-500/20 text-purple-700 dark:text-purple-300",
  "bg-teal-500/20 text-teal-700 dark:text-teal-300",
  "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
];

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Deterministic position for agent on office floor grid */
export function agentDeskPosition(index: number, total: number): { x: number; y: number } {
  // Arrange desks in rows of 4, offset from edges
  const cols = 4;
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {
    x: 80 + col * 160,
    y: 100 + row * 140,
  };
}

/** Meeting table gather positions (circular arrangement) */
export function gatherPosition(index: number, total: number, centerX: number, centerY: number): { x: number; y: number } {
  const radius = Math.max(80, total * 20);
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: centerX + radius * Math.cos(angle) - 32,
    y: centerY + radius * Math.sin(angle) - 40,
  };
}

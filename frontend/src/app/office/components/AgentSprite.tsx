"use client";

import { memo, useState } from "react";
import type { AgentRead } from "@/api/generated/model";
import { cn } from "@/lib/utils";
import { agentActivity, STATUS_DOT, AGENT_EMOJIS, PILL_COLORS } from "./helpers";

export const AgentSprite = memo(function AgentSprite({
  agent,
  index,
  selected,
  onClick,
  style,
}: {
  agent: AgentRead;
  index: number;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const activity = agentActivity(agent);
  const emoji = AGENT_EMOJIS[index % AGENT_EMOJIS.length];
  const pill = PILL_COLORS[index % PILL_COLORS.length];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute flex flex-col items-center justify-center cursor-pointer transition-all duration-500 ease-in-out",
        "w-[64px] h-[80px]",
        selected && "z-20",
      )}
      style={style}
    >
      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] text-white shadow-lg dark:bg-gray-700">
          {agent.name} · {activity}
        </div>
      )}

      {/* Avatar / Emoji */}
      <span className="text-[32px] leading-none drop-shadow-sm">{emoji}</span>

      {/* Name pill */}
      <span className={cn(
        "mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight truncate max-w-[60px]",
        agent.is_board_lead ? "bg-indigo-600 text-white" : pill,
      )}>
        {agent.name}
      </span>

      {/* Status dot */}
      <span className={cn(
        "absolute top-0 right-1 h-2 w-2 rounded-full ring-2 ring-[color:var(--surface)]",
        STATUS_DOT[activity],
      )} />

      {/* Selection ring */}
      {selected && (
        <span className="absolute inset-0 rounded-lg ring-2 ring-indigo-400 ring-offset-1 pointer-events-none" />
      )}
    </div>
  );
});

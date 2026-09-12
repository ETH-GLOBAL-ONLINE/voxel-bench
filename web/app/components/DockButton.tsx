"use client";

// A floating menu tile, the way a game shows its menu: the label on top, a
// large icon under it, a warm glow when the pointer is on it and a press when
// it is clicked.

import type { ReactNode } from "react";

export function DockButton({
  label,
  icon,
  onClick,
  glowing = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  glowing?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group flex w-[4.75rem] flex-col items-center gap-1.5 border bg-bench-900/90 px-2 pt-2 pb-2.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.85)] backdrop-blur transition-[translate,scale,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-amber hover:shadow-[0_0_0_1px_rgba(255,174,59,0.6),0_0_28px_-4px_rgba(255,174,59,0.45)] active:translate-y-0 active:scale-95 motion-reduce:transition-none ${
        glowing ? "tour-breathe border-amber" : "border-amber/40"
      }`}
    >
      <span className="label !text-[9px] !tracking-[0.14em] !text-amber">{label}</span>
      <span className="text-amber transition-transform duration-200 group-hover:scale-110">
        {icon}
      </span>
    </button>
  );
}

const svg = {
  width: 30,
  height: 30,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** A market stall: an awning over a counter. */
export const MarketIcon = () => (
  <svg {...svg}>
    <path d="M4 10v10h16V10" />
    <path d="M2.5 10 4.5 4h15l2 6z" />
    <path d="M7 10v1.5M12 10v1.5M17 10v1.5" />
    <path d="M9.5 20v-5h5v5" />
  </svg>
);

/** A backpack with its front pocket. */
export const BackpackIcon = () => (
  <svg {...svg}>
    <path d="M9 6V5a3 3 0 0 1 6 0v1" />
    <rect x="5" y="6" width="14" height="15" rx="4" />
    <path d="M8 11h8" />
    <rect x="8" y="14" width="8" height="4" rx="1" />
  </svg>
);

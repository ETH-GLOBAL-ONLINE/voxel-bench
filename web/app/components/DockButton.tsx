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

// Both icons are rendered in Blender from blocks, like everything else on the
// bench — see bench/dock_icons.py — and drawn here at twice their size for
// sharp screens.
const Rendered = ({ src }: { src: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={src}
    alt=""
    width={46}
    height={46}
    draggable={false}
    className="block select-none"
    style={{ filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.6))" }}
  />
);

/** A market stall: a striped awning over a stone counter. */
export const MarketIcon = () => <Rendered src="/icons/market.webp" />;

/** A backpack with a glowing seam on its flap and its pocket. */
export const BackpackIcon = () => <Rendered src="/icons/backpack.webp" />;

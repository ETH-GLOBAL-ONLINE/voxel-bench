"use client";

// The guide through the happy path, in two steps: give your agent a budget,
// then describe what you want. Each step dims the page, lets the one thing to
// do next glow, and puts a note beside it with an arrow.
//
// The glow is the element's own — `tour-breathe` on whatever is being pointed
// at, raised above the dim. The dim is portalled to the body so that no
// ancestor's stacking decides what it covers.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Sent when the budget is set during the guide, to move it to step two. */
export const TOUR_NEXT = "voxelbench:tour:describe";

// The whole happy path: budget, describe, claim, backpack, build an obby, and
// publish what it made. Each step lives with the thing it points at and hands
// on to the next with an event.
export const TOUR_STEPS = 6;
export const TOUR_EVENTS = {
  backpack: "voxelbench:tour:backpack",
  obby: "voxelbench:tour:obby",
} as const;

// Skipping any step skips the rest, until the page is loaded again.
const TOUR = { skipped: false };
export const skipTour = () => {
  TOUR.skipped = true;
};
/** Whether the guide should carry on: not skipped, and not turned off with ?tour=0. */
export const tourOn = () =>
  !TOUR.skipped &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("tour") !== "0";

/**
 * Scroll so that `el` and the note under it both fit, clear of the header.
 * The note is about 190px tall; the header about 64.
 */
export function bringIntoView(el: HTMLElement | null) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  const room = window.innerHeight - el.offsetHeight - 190;
  const offset = Math.max(80, Math.min(room / 2, 160));
  const target = Math.max(0, top - offset);
  // Through the page's smooth scroll when there is one, so the two never
  // pull in different directions.
  if (window.__lenis) window.__lenis.scrollTo(target);
  else window.scrollTo({ top: target, behavior: "smooth" });
}

export function Spotlight({ onClose }: { onClose: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => setHost(document.body), []);

  // While a step is up, anything floating above the page (the dock) goes
  // under the dim with everything else, unless the step is about it.
  useEffect(() => {
    document.documentElement.classList.add("tour-active");
    return () => document.documentElement.classList.remove("tour-active");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!host) return null;
  return createPortal(
    <div
      aria-hidden
      onClick={onClose}
      className="tour-fade fixed inset-0 z-30 bg-bench-950/70 backdrop-blur-[1.5px]"
    />,
    host,
  );
}

export function TourBubble({
  step,
  total,
  title,
  children,
  onDismiss,
  action,
  align = "left",
  placement = "below",
}: {
  step: number;
  total: number;
  title: string;
  children: ReactNode;
  onDismiss: () => void;
  /** A way forward that is not the thing being pointed at, when there is one. */
  action?: { label: string; onClick: () => void };
  /** Which edge of the element the note lines up with. Right, near the right of the screen. */
  align?: "left" | "right";
  /** Where the note sits: under the element, or to its left — for something floating on the right. */
  placement?: "below" | "left";
}) {
  const right = align === "right";
  const beside = placement === "left";
  return (
    // Below what it points at by default: above, it would sit under the fixed
    // header whenever the element is near the top of the screen.
    <div
      role="dialog"
      aria-label={`Step ${step} of ${total}: ${title}`}
      className={`tour-in absolute z-50 border border-amber/40 bg-bench-900 p-4 text-left shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] ${
        beside
          ? "top-1/2 right-full mr-4 w-[min(22rem,calc(100vw-7rem))] -translate-y-1/2"
          : right
            ? "top-full right-0 mt-4 w-[min(22rem,calc(100vw-2rem))]"
            : "top-full left-4 mt-4 w-[min(23rem,calc(100%-2rem))]"
      }`}
    >
      <div className="tour-stagger">
        <div className="flex items-center gap-2">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="h-1 w-6 overflow-hidden bg-bench-700">
              {i < step && (
                <span
                  className={`block h-full w-full bg-amber ${i === step - 1 ? "tour-fill" : ""}`}
                />
              )}
            </span>
          ))}
          <span className="label !text-amber">
            step {step} of {total}
          </span>
        </div>
        <p className="mt-2.5 text-base font-semibold text-ink">{title}</p>
        <div className="mt-1 text-sm leading-relaxed text-dim">{children}</div>
        <div className="mt-3 flex items-center gap-4">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="border border-amber/60 px-2.5 py-1 text-xs text-amber transition-colors hover:bg-amber/10"
            >
              {action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
          >
            Skip the tour
          </button>
        </div>
      </div>
      {/* The arrow, pointing at what to do next: up, or right when beside it. */}
      {beside ? (
        <span aria-hidden className="absolute top-1/2 -right-[7px] block -translate-y-1/2">
          <span className="block h-3 w-3 rotate-45 border-t border-r border-amber/40 bg-bench-900" />
        </span>
      ) : (
        <span
          aria-hidden
          className={`tour-bob absolute -top-[7px] block ${right ? "right-7" : "left-7"}`}
        >
          <span className="block h-3 w-3 rotate-45 border-l border-t border-amber/40 bg-bench-900" />
        </span>
      )}
    </div>
  );
}

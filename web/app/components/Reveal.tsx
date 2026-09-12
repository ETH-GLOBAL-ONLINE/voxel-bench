"use client";

// Content that rises into place as it scrolls into view.
//
// Tied to the scroll rather than played once: it moves with every wheel tick
// and runs backwards on the way up. `deep` staggers the children of its child
// — the cards of a grid — instead of the block as a whole. Content below the
// fold is only ever set to its starting state before it is seen, so nothing
// flashes; with reduced motion asked for, nothing moves.

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Reveal({
  children,
  deep = false,
  className,
}: {
  children: ReactNode;
  deep?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(deep ? ":scope > * > *" : ":scope > *"));
      if (!items.length) return;
      gsap.from(items, {
        y: 56,
        autoAlpha: 0,
        stagger: 0.12,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top 92%", end: "top 50%", scrub: 0.6 },
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

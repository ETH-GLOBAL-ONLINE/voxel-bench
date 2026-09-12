"use client";

// Momentum scroll for the whole page, with GSAP's ScrollTrigger driven by the
// same loop so scroll-linked motion never lags behind the scroll.
//
// Lenis moves the page's native scroll rather than faking it with a
// transform, so everything that reads `window.scrollY` keeps working. Anything
// with its own scroll or wheel — the modals, the 3D viewer — opts out with
// `data-lenis-prevent`. With reduced motion asked for, it scrolls natively.

import { useEffect, useState, type ReactNode } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    /** The page's Lenis, for code that scrolls the page itself (the guide). */
    __lenis?: {
      scrollTo: (target: number | string | HTMLElement, options?: { offset?: number }) => void;
    };
  }
}

function Glue() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;
    window.__lenis = lenis;
    const off = lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      off();
      gsap.ticker.remove(tick);
      if (window.__lenis === lenis) delete window.__lenis;
    };
  }, [lenis]);

  return null;
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Always mounted, so the page never remounts under it; reduced motion only
  // turns the smoothing off.
  return (
    <ReactLenis
      root
      options={{ lerp: reduced ? 1 : 0.09, smoothWheel: !reduced, anchors: true, autoRaf: false }}
    >
      <Glue />
      {children}
    </ReactLenis>
  );
}

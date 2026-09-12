"use client";

// The hero, with its motion.
//
// A lamp switching on over the workbench: the art settles in, the headline
// rises line by line, the rest follows, and the numbers count up. Scrolling
// away moves the art slower than the text, so the scene has depth, and a few
// embers drift up over the workshop.
//
// The copy is exactly what the server renders. Motion is layered on after
// hydration; with reduced motion asked for, nothing moves. Until the entrance
// has set its starting state the hero is hidden by a class a script in the
// layout adds — and takes away after three seconds whatever happens, so the
// text can never stay hidden behind an animation.

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Stat = { value: number; decimals: number; prefix?: string; suffix?: string; label: string };

const STATS: Stat[] = [
  { value: 7, decimals: 0, prefix: "~", suffix: "s", label: "to craft" },
  { value: 0.006, decimals: 3, label: "USDC a craft" },
  { value: 0, decimals: 0, label: "gas" },
  { value: 2, decimals: 0, label: "chains" },
];

const shown = (s: Stat, v = s.value) => `${s.prefix ?? ""}${v.toFixed(s.decimals)}${s.suffix ?? ""}`;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Hero() {
  const scope = useRef<HTMLElement>(null);
  const embers = useRef<HTMLCanvasElement>(null);

  useGSAP(
    () => {
      const reveal = () => document.documentElement.classList.remove("hero-pending");
      if (reducedMotion()) {
        reveal();
        return;
      }

      // The entrance. Each `from` sets its starting state as it is created,
      // so the hero is only revealed once nothing would flash in its final
      // place first.
      const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.1 } });
      // Each entrance clears what it set once it lands, so the text and the
      // buttons are left with no inline styles — and their own hover
      // transitions — rather than whatever the last frame wrote. The buttons
      // are entered as a group: animating the links themselves fights the
      // opacity transition the primary one has for its hover, and it stuck.
      tl.from("[data-hero-art]", { scale: 1.12, autoAlpha: 0, duration: 1.8, ease: "power2.out", clearProps: "all" }, 0)
        .from("[data-hero-label]", { y: 14, autoAlpha: 0, clearProps: "all" }, 0.2)
        .from("[data-hero-line]", { yPercent: 115, stagger: 0.12, duration: 1.25, clearProps: "transform" }, 0.3)
        .from("[data-hero-copy]", { y: 18, autoAlpha: 0, stagger: 0.1, clearProps: "all" }, 0.75)
        .from("[data-hero-ctas]", { y: 14, autoAlpha: 0, clearProps: "all" }, 0.95)
        .from("[data-hero-stat]", { y: 22, autoAlpha: 0, stagger: 0.08, clearProps: "all" }, 1.05);

      // The numbers count up to what they say.
      scope.current?.querySelectorAll<HTMLElement>("[data-count]").forEach((el, i) => {
        const stat = STATS[Number(el.dataset.count)];
        if (!stat || stat.value === 0) return;
        const counter = { v: 0 };
        el.textContent = shown(stat, 0);
        tl.to(
          counter,
          {
            v: stat.value,
            duration: 1.4,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = shown(stat, counter.v);
            },
          },
          1.15 + i * 0.08,
        );
      });

      reveal();

      // Scrolling away. The hero stays pinned while the page covers it; as it
      // does, the art pushes in and the text lifts and fades. Measured on the
      // page's scroll rather than on the pinned section, whose own position
      // stops moving once it sticks. Tied to the scroll, so it runs backwards.
      const scroll = {
        start: 0,
        end: () => `+=${scope.current?.offsetHeight ?? window.innerHeight}`,
        scrub: true,
        invalidateOnRefresh: true,
      };
      gsap.to("[data-hero-parallax]", { scale: 1.18, yPercent: 6, ease: "none", scrollTrigger: scroll });
      gsap.to("[data-hero-content]", { y: -90, autoAlpha: 0, ease: "none", scrollTrigger: scroll });
    },
    { scope },
  );

  // Embers over the workshop: a small canvas of warm points drifting up on
  // the side the art is on. Paused whenever the hero is off screen.
  useEffect(() => {
    const canvas = embers.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type Ember = { x: number; y: number; r: number; vx: number; vy: number; life: number; max: number };
    const spawn = (): Ember => ({
      x: w * (0.45 + Math.random() * 0.55),
      y: h * (0.5 + Math.random() * 0.5),
      r: 0.6 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -(0.15 + Math.random() * 0.4),
      life: 0,
      max: 240 + Math.random() * 260,
    });
    const field: Ember[] = Array.from({ length: 44 }, () => {
      const e = spawn();
      e.life = Math.random() * e.max;
      return e;
    });

    let raf = 0;
    let visible = true;
    const frame = () => {
      raf = 0;
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "rgba(255, 150, 40, 0.9)";
      ctx.shadowBlur = 8;
      for (const e of field) {
        e.life += 1;
        e.x += e.vx + Math.sin(e.life / 40) * 0.15;
        e.y += e.vy;
        if (e.life > e.max || e.y < -10) Object.assign(e, spawn());
        const alpha = Math.sin((Math.PI * e.life) / e.max) * 0.7;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 174, 59, ${alpha})`;
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    watcher.observe(canvas);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      watcher.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    // Full-bleed art behind the hero: the scene sits on the right, and a
    // scrim in the page's own ground darkens the left so the text reads over
    // it. A second fade at the bottom hands over to the next section.
    <section
      ref={scope}
      id="top"
      // Pinned: the rest of the page scrolls up over it.
      className="sticky top-0 z-0 isolate overflow-hidden border-b border-bench-700 lg:min-h-[40rem]"
    >
      <div data-hero-parallax aria-hidden className="absolute inset-0 -z-20">
        <div data-hero-art data-hero-hide className="absolute inset-0">
          <Image
            src="/hero/voxel-bench-hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[72%_center]"
          />
        </div>
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, var(--color-bench-950) 0%, color-mix(in srgb, var(--color-bench-950) 88%, transparent) 36%, color-mix(in srgb, var(--color-bench-950) 25%, transparent) 70%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-32"
        style={{
          background: "linear-gradient(0deg, var(--color-bench-950) 0%, transparent 100%)",
        }}
      />
      <canvas
        ref={embers}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      />

      <div data-hero-content className="mx-auto max-w-6xl px-5 pt-20 pb-16">
        <p data-hero-label data-hero-hide className="label mb-5">
          Agent-run Roblox studio · ETHOnline 2026
        </p>
        {/* Each line rises out of its own mask. The padding keeps descenders
            from being clipped by it. */}
        <h1
          data-hero-hide
          className="max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl"
        >
          <span className="block overflow-hidden pb-[0.14em]">
            <span data-hero-line className="block">
              Craft your Roblox game,
            </span>
          </span>
          <span className="-mt-[0.14em] block overflow-hidden pb-[0.14em]">
            <span data-hero-line className="block text-amber">
              one object at a time.
            </span>
          </span>
        </h1>
        <p data-hero-copy data-hero-hide className="mt-6 max-w-xl text-lg leading-relaxed text-dim">
          Describe what you need. An agent builds a 3D model and uploads it to
          your Roblox account, paying its own way within a budget you set.
        </p>
        <p data-hero-copy data-hero-hide className="mt-4 max-w-xl leading-relaxed text-faint">
          Objects and obbies work today. When someone crafts your recipe, you
          earn 90%.
        </p>

        <div data-hero-ctas data-hero-hide className="mt-9 flex flex-wrap gap-3">
          <a
            href="#bench"
            className="bg-amber px-5 py-2.5 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90"
          >
            See what it crafted
          </a>
          <a
            href="#how"
            className="border border-bench-600 px-5 py-2.5 text-sm text-dim transition-colors hover:text-ink"
          >
            How it works
          </a>
        </div>

        <dl className="mt-16 grid max-w-2xl grid-cols-2 gap-px border border-bench-700 bg-bench-700 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} data-hero-stat data-hero-hide className="bg-bench-900 px-4 py-3.5">
              <dt data-count={i} className="font-mono text-xl text-amber tabular-nums">
                {shown(s)}
              </dt>
              <dd className="label mt-1">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

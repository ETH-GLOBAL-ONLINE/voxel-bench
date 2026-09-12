"use client";

// Why it's paid onchain: three reasons, the path a craft's money takes, and the
// contracts that hold it.
//
// The path is the part worth watching. As it scrolls through, a line fills
// from the first stage to the last and each stage lights up as the line
// reaches it, so the order of the payments is something you see rather than
// read. It is tied to the scroll and runs backwards on the way up. The markup
// is the finished state: without motion, or before the script runs, every
// stage is already lit.

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const REASONS = [
  {
    figure: "2¢",
    kicker: "what a craft should cost",
    t: "Two cents in, ninety out",
    d: "A card cannot process two cents for less than two cents. The harder half is the other way: paying forty authors ninety cents each, in twenty countries, costs more in fees than it moves.",
  },
  {
    figure: "90%",
    count: 90,
    kicker: "of every craft, to its author",
    t: "Authors get paid without trusting us",
    d: "Forty people craft with your recipe, you earn forty times. The split is a contract and the ledger is public, so nobody takes our bookkeeping on faith.",
  },
  {
    figure: "0",
    kicker: "prompts that can raise the cap",
    t: "The agent’s limits are not a prompt",
    d: "Your budget is a signed USDC permit, and the token refuses anything past it. The platform’s cap is a contract too. A prepaid card, not your credit card.",
  },
];

const FLOW = [
  { t: "Your budget", d: "you pay your agent", tag: "USDC · Arc" },
  { t: "Recipe", d: "the agent pays the recipe service", tag: "x402 · Hedera" },
  { t: "Craft", d: "the agent pays the craft service", tag: "Nanopayments · Arc" },
  { t: "Author", d: "a recipe with an author pays them 90%", tag: "RecipeBook" },
  { t: "Publish", d: "when you ask, paid the same way", tag: "x402 · Hedera" },
];

const CONTRACTS = [
  ["RecipeBook", "recipe, author, split terms, craft count"],
  ["SplitVault", "what each author has earned, and can withdraw"],
  ["Allowance", "the agent’s spending cap, and the human signature needed to raise it"],
];

// The theme's colours, for the tweens that move between them.
const AMBER = "#ffae3b";
const UNLIT = { border: "#4e4840", text: "#7a7167", bg: "#131110" };

function Cube() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7l9 5 9-5M12 12v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function Onchain() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const flow = root.querySelector<HTMLElement>("[data-flow]")!;
      const track = root.querySelector<HTMLElement>("[data-flow-track]")!;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-flow-node]"));

      // The line runs from the first stage's marker to the last one's, across
      // on a wide screen and down on a narrow one. Placed from the markers
      // themselves, so it stays right however the text wraps.
      const place = () => {
        const box = track.parentElement!.getBoundingClientRect();
        const a = nodes[0].getBoundingClientRect();
        const b = nodes[nodes.length - 1].getBoundingClientRect();
        const across = b.top - a.top < a.height;
        Object.assign(track.style, {
          left: `${a.left + a.width / 2 - box.left}px`,
          top: `${a.top + a.height / 2 - box.top}px`,
          width: across ? `${b.left - a.left}px` : "1px",
          height: across ? "1px" : `${b.top - a.top}px`,
        });
        track.dataset.across = String(across);
      };
      place();
      ScrollTrigger.addEventListener("refreshInit", place);

      const mm = gsap.matchMedia();
      mm.add(
        {
          wide: "(min-width: 1024px)",
          still: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { wide, still } = ctx.conditions as { wide: boolean; still: boolean };
          if (still) return;

          // The reasons rise in, and their figures with them.
          const cards = root.querySelectorAll<HTMLElement>("[data-reason]");
          gsap.from(cards, {
            y: 56,
            autoAlpha: 0,
            stagger: 0.12,
            ease: "none",
            scrollTrigger: { trigger: cards[0], start: "top 92%", end: "top 55%", scrub: 0.6 },
          });
          root.querySelectorAll<HTMLElement>("[data-figure]").forEach((fig) => {
            gsap.from(fig, {
              yPercent: 110,
              ease: "none",
              scrollTrigger: { trigger: fig, start: "top 95%", end: "top 65%", scrub: 0.6 },
            });
          });
          root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
            const to = Number(el.dataset.count);
            const n = { v: 0 };
            gsap.to(n, {
              v: to,
              ease: "none",
              onUpdate: () => {
                el.textContent = `${Math.round(n.v)}%`;
              },
              scrollTrigger: { trigger: el, start: "top 95%", end: "top 60%", scrub: 0.6 },
            });
          });
          root.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar) => {
            gsap.from(bar, {
              scaleX: 0,
              ease: "none",
              scrollTrigger: { trigger: bar, start: "top 90%", end: "top 55%", scrub: 0.6 },
            });
          });

          // The path: the line fills, a spark rides it, each stage lights as
          // the spark reaches it.
          const fill = track.querySelector<HTMLElement>("[data-flow-fill]")!;
          const spark = track.querySelector<HTMLElement>("[data-flow-spark]")!;
          const texts = root.querySelectorAll<HTMLElement>("[data-flow-text]");
          const across = () => track.dataset.across === "true";
          fill.style.transformOrigin = wide ? "left center" : "center top";

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: flow,
              start: "top 75%",
              end: wide ? "top 20%" : "bottom 65%",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          });
          tl.fromTo(fill, wide ? { scaleX: 0 } : { scaleY: 0 }, wide ? { scaleX: 1, duration: 1 } : { scaleY: 1, duration: 1 }, 0);
          tl.fromTo(
            spark,
            { x: 0, y: 0 },
            {
              x: () => (across() ? track.offsetWidth : 0),
              y: () => (across() ? 0 : track.offsetHeight),
              duration: 1,
            },
            0,
          );
          const last = nodes.length - 1;
          nodes.forEach((node, i) => {
            const at = i / last;
            tl.fromTo(
              node,
              { scale: 0.72, rotate: -45, borderColor: UNLIT.border, color: UNLIT.text, backgroundColor: UNLIT.bg },
              { scale: 1, rotate: 0, borderColor: AMBER, color: UNLIT.bg, backgroundColor: AMBER, duration: 0.08 },
              Math.max(0, at - 0.04),
            );
            tl.fromTo(
              texts[i],
              { autoAlpha: 0.2, y: 14 },
              { autoAlpha: 1, y: 0, duration: 0.12 },
              Math.max(0, at - 0.08),
            );
          });

          // The note under it and the contracts come in last.
          gsap.from(root.querySelectorAll("[data-contract]"), {
            y: 40,
            autoAlpha: 0,
            stagger: 0.15,
            ease: "none",
            scrollTrigger: {
              trigger: root.querySelector("[data-contracts]"),
              start: "top 92%",
              end: "top 60%",
              scrub: 0.6,
            },
          });
        },
      );

      return () => {
        ScrollTrigger.removeEventListener("refreshInit", place);
        mm.revert();
      };
    },
    { scope },
  );

  return (
    <div ref={scope}>
      {/* ── three reasons ─────────────────────────────────────────────── */}
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {REASONS.map((r) => (
          <article
            key={r.t}
            data-reason
            className="group relative overflow-hidden border border-bench-700 bg-bench-850 p-6 transition-colors duration-300 hover:border-amber/50 hover:bg-bench-800"
          >
            <span
              data-bar
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 origin-left bg-amber"
            />
            <div className="overflow-hidden">
              <p
                data-figure
                className="font-mono text-5xl font-bold tracking-tight text-amber tabular-nums"
              >
                <span data-count={r.count}>{r.figure}</span>
              </p>
            </div>
            <p className="label mt-2">{r.kicker}</p>
            <h3 className="mt-6 font-semibold">{r.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-dim">{r.d}</p>
          </article>
        ))}
      </div>

      {/* ── what happens on a craft ──────────────────────────────────── */}
      <div data-flow className="mt-16">
        <p className="label mb-8">What actually happens on a craft</p>
        <div className="relative">
          <div data-flow-track aria-hidden className="absolute bg-bench-700">
            <span data-flow-fill className="absolute inset-0 bg-amber" />
            <span
              data-flow-spark
              className="absolute -left-[4px] -top-[4px] h-[9px] w-[9px] bg-amber shadow-[0_0_14px_3px_rgb(255_174_59/0.7)]"
            />
          </div>
          <ol className="relative grid gap-8 lg:grid-cols-5 lg:gap-4">
            {FLOW.map((s, i) => (
              <li key={s.t} className="flex gap-5 lg:flex-col lg:items-center lg:text-center">
                <span
                  data-flow-node
                  className="relative z-10 grid h-9 w-9 shrink-0 place-items-center border border-amber bg-amber font-mono text-sm font-bold text-bench-950"
                >
                  {i + 1}
                </span>
                <div data-flow-text className="lg:mt-5">
                  <p className="font-semibold">{s.t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-dim">{s.d}</p>
                  <span className="mt-3 inline-block border border-bench-600 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber uppercase">
                    {s.tag}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-12 max-w-3xl border-l-2 border-amber pl-5 text-sm leading-relaxed text-dim">
          <span className="text-ink">Each stage is a separate paid service</span>,
          so no secrets are shared between them. The craft service cannot
          publish; the publish service never sees your prompt. Compromising one
          does not hand over the others — that is the real argument for paying
          rather than sharing an API key.
        </p>
      </div>

      {/* ── three contracts ──────────────────────────────────────────── */}
      <div data-contracts className="mt-16">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="label">Three contracts</p>
          <p className="label !normal-case !tracking-normal">
            Deliberately small. Details in <code>docs/ONCHAIN.md</code>.
          </p>
        </div>
        <dl className="grid gap-4 md:grid-cols-3">
          {CONTRACTS.map(([name, what]) => (
            <div
              key={name}
              data-contract
              className="flex gap-4 border border-bench-700 bg-bench-900 p-5 transition-colors duration-300 hover:border-amber/50"
            >
              <span className="mt-0.5 text-amber">
                <Cube />
              </span>
              <div>
                <dt className="font-mono text-sm text-amber">{name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-dim">{what}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

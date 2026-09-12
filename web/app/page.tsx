import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Image from "next/image";
import Bench from "./components/Bench";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Reveal from "./components/Reveal";
import Onchain from "./components/Onchain";
import BenchStatus from "./components/BenchStatus";
import Marketplace from "./components/Marketplace";
import { HeaderWallet } from "./components/Wallet";
import Dock from "./components/Dock";
// Statically imported so it is bundled: out/ is outside the app and never
// reaches a deployment, so this is the report a deployed site actually shows.
import sampleReport from "../public/samples/sakura_garden.report.json";

const SAMPLE = "sakura_garden";

type Report = {
  name: string;
  tris: number;
  ingredients: number;
  // A cone becomes four Roblox parts, so this is not the ingredient count.
  parts?: number;
  // number[] rather than a 3-tuple: the imported JSON widens it, and a cast
  // through unknown to win that argument would only hide a real mismatch.
  dims_studs: number[];
  bytes_fbx: number;
  bytes_glb: number;
};

async function loadReport(): Promise<Report> {
  try {
    const local = resolve(process.cwd(), "..", "out", `${SAMPLE}.report.json`);
    return JSON.parse(await readFile(local, "utf-8"));
  } catch {
    return sampleReport;
  }
}

const STEPS = [
  {
    n: "01",
    t: "Give your agent a budget",
    d: "Sign in with an email, Google, X or a wallet, and sign a limit in USDC. No gas, no transaction. The agent pays every stage from it and can never take more.",
  },
  {
    n: "02",
    t: "Describe it",
    d: "One sentence. The model writes a recipe — ingredients with sizes in studs, Roblox's own unit — and headless Blender builds it and renders a preview in seconds.",
  },
  {
    n: "03",
    t: "Claim it",
    d: "Sign once more and the recipe is yours on RecipeBook. Whenever someone else crafts it, you earn 90%.",
  },
  {
    n: "04",
    t: "It lands in Roblox",
    d: "Publish, and it uploads through Open Cloud into your own account, with its render as the icon. Or build an obby from your recipes and play it in Studio.",
  },
];

const STAGES = [
  {
    tag: "live",
    t: "Objects",
    d: "A prompt becomes a crate, a lamp post, a market stall — crafted, previewed and uploaded to your Roblox account.",
    tone: "text-sap border-sap/40 bg-sap/10",
  },
  {
    tag: "live",
    t: "A whole game, one genre at a time",
    d: "An obby is a recipe of recipes. Pick pieces from your backpack and the marketplace and they become a course you play in Studio — a spawn, hazards that kill, platforms that move, a timed finish — with every piece's author paid.",
    tone: "text-sap border-sap/40 bg-sap/10",
  },
  {
    tag: "next",
    t: "Objects that do something",
    d: "A crate that sits there is decoration. A crate that gives you coins when touched is a mechanic. The obby already carries its own script; single objects are next.",
    tone: "text-amber border-amber/40 bg-amber/10",
  },
];

export default async function Home() {
  const report = await loadReport();
  const dims = report.dims_studs;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-bench-700 bg-bench-950/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-8 px-5 py-4">
          <a href="#top" className="flex items-center gap-2.5">
            <Image
              src="/logo/voxel-bench-logo.png"
              alt=""
              width={32}
              height={32}
              priority
              className="h-8 w-8"
            />
            <span className="text-[13px] font-bold tracking-[0.2em] uppercase">
              Voxel Bench
            </span>
          </a>
          <div className="ml-auto hidden gap-7 md:flex">
            {[
              ["How it works", "#how"],
              ["The bench", "#bench"],
              ["Where it goes", "#stages"],
              ["Why onchain", "#onchain"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm text-dim transition-colors hover:text-ink"
              >
                {label}
              </a>
            ))}
          </div>
          <HeaderWallet />
        </nav>
      </header>

      {/* Marketplace and Backpack, floating on the right once past the hero. */}
      <Dock />

      {/* ── hero ──────────────────────────────────────────────────────── */}
      <Hero />

      {/* Everything after the hero, opaque, so it covers the pinned hero as
          the page scrolls. It covers by coming later in the page, not by a
          z-index: one here would make it a layer of its own and trap the
          guide's highlighted element under the guide's dim. */}
      <div className="relative bg-bench-950">
      <Marquee />

      {/* ── how it works ──────────────────────────────────────────────── */}
      <section id="how" className="border-t border-bench-700 bg-bench-900">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-lg text-dim">
            No Blender. No Roblox Studio. A browser.
          </p>

          <Reveal deep>
          <ol className="mt-10 grid gap-px border border-bench-700 bg-bench-700 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-bench-850 p-6">
                <span className="font-mono text-sm text-amber">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dim">{s.d}</p>
              </li>
            ))}
          </ol>
          </Reveal>
        </div>
      </section>

      {/* ── the bench ─────────────────────────────────────────────────── */}
      <section id="bench" className="border-t border-bench-700">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">The bench</h2>
              <p className="mt-2 text-dim">
                Give your agent a budget, then describe an object or build an
                obby. Drag the result to orbit it.
              </p>
            </div>
            <BenchStatus />
          </div>

          <Bench
            sample={{
              name: report.name,
              ingredients: report.ingredients,
              parts: report.parts,
              tris: report.tris,
              studs: dims,
            }}
          />
        </div>
      </section>

      {/* ── stages ────────────────────────────────────────────────────── */}
      <section id="stages" className="border-t border-bench-700 bg-bench-900">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-bold tracking-tight">
            From an object to a game
          </h2>

          <blockquote className="mt-6 max-w-2xl border-l-2 border-amber pl-5 text-lg leading-relaxed">
            You can build a playable Roblox game from this platform, within the
            genres we support, and refine it in Studio.
          </blockquote>
          <p className="mt-3 max-w-2xl text-sm text-faint">
            Not &ldquo;any game&rdquo;. That would be a lie, and anyone who knows
            Roblox would spot it immediately. A bounded claim we can demonstrate
            beats a big one we cannot.
          </p>

          <Reveal deep>
          <ol className="mt-10 grid gap-px border border-bench-700 bg-bench-700 md:grid-cols-3">
            {STAGES.map((s) => (
              <li key={s.t} className="bg-bench-850 p-6">
                <span
                  className={`inline-block border px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] uppercase ${s.tone}`}
                >
                  {s.tag}
                </span>
                <h3 className="mt-4 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dim">{s.d}</p>
              </li>
            ))}
          </ol>
          </Reveal>
        </div>
      </section>

      {/* ── why onchain ───────────────────────────────────────────────── */}
      <section id="onchain" className="border-t border-bench-700">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-bold tracking-tight">Why it&rsquo;s paid onchain</h2>
          <p className="mt-2 max-w-lg text-dim">
            Three reasons, none of them decorative.
          </p>

          <Onchain />

          {/* The shelf gets the full width; the note on revenue follows it. */}
          <div className="mt-16">
            <Marketplace />
            <p className="mt-6 text-sm leading-relaxed text-faint">
              Your game&rsquo;s revenue never touches any of this. Roblox
              prohibits blockchain integrations and off-platform monetisation, so
              what your game earns stays in Robux and stays yours. We charge for
              crafting, the way a print shop bills for printing and not for what
              you sell.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-bench-700 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-2 text-center">
          <p className="label">Voxel Bench · ETHOnline 2026</p>
          <p className="label !text-faint">built from scratch</p>
        </div>
      </footer>
      </div>
    </div>
  );
}

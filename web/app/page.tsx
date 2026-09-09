import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Bench from "./components/Bench";
import BenchStatus from "./components/BenchStatus";
// Statically imported so it is bundled: out/ is outside the app and never
// reaches a deployment, so this is the report a deployed site actually shows.
import sampleReport from "../public/samples/market_stall.report.json";

const SAMPLE = "market_stall";

type Report = {
  name: string;
  tris: number;
  ingredients: number;
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
    t: "Describe it",
    d: "One sentence. The model turns it into a recipe — a list of ingredients with sizes, measured in studs, Roblox's own unit.",
  },
  {
    n: "02",
    t: "The bench crafts it",
    d: "Headless Blender builds the ingredients and renders a preview. Seven seconds. You see it before anything is published, and before you pay to publish.",
  },
  {
    n: "03",
    t: "It lands in Roblox",
    d: "Approve, and it uploads through Open Cloud into your own account. You get an assetId and drop it into your game.",
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
    tag: "next",
    t: "Objects that do something, and a marketplace",
    d: "A crate that sits there is decoration. A crate that gives you coins when touched is a mechanic. Objects ship with Luau, and recipes get published so other people can craft with yours.",
    tone: "text-amber border-amber/40 bg-amber/10",
  },
  {
    tag: "then",
    t: "A whole game, one genre at a time",
    d: "An obby is a sequence of platforms, hazards, checkpoints and a finish — which is spatial arrangement of objects. An obby is a recipe of recipes. Same metaphor, bigger scale.",
    tone: "text-dim border-bench-600 bg-bench-800",
  },
];

export default async function Home() {
  const report = await loadReport();
  const dims = report.dims_studs;

  return (
    <div className="min-h-screen">
      <div className="border-b border-bench-700 bg-bench-900 px-5 py-2 text-center">
        <p className="label !text-amber">
          Prototype · the crafter runs on a real machine, not here · wallet,
          payments and publishing are not wired yet
        </p>
      </div>

      <header className="sticky top-0 z-50 border-b border-bench-700 bg-bench-950/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-8 px-5 py-4">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center border border-amber/50 bg-amber/10 text-[13px] font-bold text-amber">
              V
            </span>
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
          <button
            disabled
            className="ml-auto cursor-not-allowed border border-bench-600 px-3.5 py-1.5 text-xs text-faint md:ml-0"
            title="Not wired yet — Track B"
          >
            Connect wallet
          </button>
        </nav>
      </header>

      {/* ── hero ──────────────────────────────────────────────────────── */}
      <section id="top" className="mx-auto max-w-6xl px-5 pt-20 pb-16">
        <p className="label mb-5">
          Agent-run Roblox studio · ETHOnline 2026
        </p>
        <h1 className="max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
          Craft your Roblox game,
          <br />
          <span className="text-amber">one object at a time.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-dim">
          Describe what you need. An agent builds it in Blender, uploads it
          straight to your own Roblox account, and pays for each step from its
          own wallet. You install nothing.
        </p>
        <p className="mt-4 max-w-xl leading-relaxed text-faint">
          Objects work today. Objects that do something, a marketplace of
          recipes, and a playable game are where this goes.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
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
          {[
            ["7s", "to craft"],
            ["398", "triangles"],
            ["75 KB", "fbx"],
            ["0", "installs"],
          ].map(([v, k]) => (
            <div key={k} className="bg-bench-900 px-4 py-3.5">
              <dt className="font-mono text-xl text-amber">{v}</dt>
              <dd className="label mt-1">{k}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── how it works ──────────────────────────────────────────────── */}
      <section id="how" className="border-t border-bench-700 bg-bench-900">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-lg text-dim">
            No Blender. No Roblox Studio. A browser.
          </p>

          <ol className="mt-10 grid gap-px border border-bench-700 bg-bench-700 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-bench-850 p-6">
                <span className="font-mono text-sm text-amber">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dim">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── the bench ─────────────────────────────────────────────────── */}
      <section id="bench" className="border-t border-bench-700">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">The bench</h2>
              <p className="mt-2 text-dim">
                Describe an object. Drag the result to orbit it.
              </p>
            </div>
            <BenchStatus />
          </div>

          <Bench
            sample={{
              name: report.name,
              ingredients: report.ingredients,
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
        </div>
      </section>

      {/* ── why onchain ───────────────────────────────────────────────── */}
      <section id="onchain" className="border-t border-bench-700">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-bold tracking-tight">Why it&rsquo;s paid onchain</h2>
          <p className="mt-2 max-w-lg text-dim">
            Three reasons, none of them decorative.
          </p>

          <div className="mt-10 grid gap-px border border-bench-700 bg-bench-700 md:grid-cols-3">
            <div className="bg-bench-850 p-6">
              <h3 className="font-semibold">Two cents is a real price</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                The unit of sale is one craft, which should cost cents. Card
                rails cannot process two cents for less than two cents — and a
                large share of Roblox creators are young enough that a card is
                not theirs to use.
              </p>
            </div>
            <div className="bg-bench-850 p-6">
              <h3 className="font-semibold">Recipe authors get paid without trusting us</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                If forty people craft with your recipe, you earn on each craft.
                The split is a contract and the ledger is public, so nobody has
                to take our bookkeeping on faith.
              </p>
            </div>
            <div className="bg-bench-850 p-6">
              <h3 className="font-semibold">The agent&rsquo;s spending cap is not a prompt</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                The crafter holds its own wallet and pays per step. Its limit
                lives onchain, where the model cannot talk it out of anything —
                a prepaid card, not your credit card.
              </p>
            </div>
          </div>

          {/* the mechanism, briefly */}
          <div className="mt-px grid gap-px border border-bench-700 bg-bench-700 lg:grid-cols-[1fr_minmax(0,22rem)]">
            <div className="bg-bench-900 p-6">
              <p className="label mb-4">What actually happens on a craft</p>
              <ol className="space-y-2.5 font-mono text-sm">
                {[
                  ["1", "the agent pays the recipe service", "x402"],
                  ["2", "the agent pays the craft service", "x402"],
                  ["3", "you approve the preview"],
                  ["4", "the agent pays the publish service", "x402"],
                  ["5", "the fee splits to the recipe author", "SplitVault"],
                ].map(([n, text, tag]) => (
                  <li key={n} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-faint">{n}</span>
                    <span className="text-dim">{text}</span>
                    {tag ? (
                      <span className="border border-bench-600 px-1.5 text-[10px] tracking-wider text-amber uppercase">
                        {tag}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-sm leading-relaxed text-faint">
                Each stage is a separate paid service, so no secrets are shared
                between them. The craft service cannot publish; the publish
                service never sees your prompt. Compromising one does not hand
                over the others — that is the real argument for paying rather
                than sharing an API key.
              </p>
            </div>

            <div className="bg-bench-900 p-6">
              <p className="label mb-4">Three contracts</p>
              <dl className="space-y-4">
                {[
                  ["RecipeBook", "recipe, author, split terms, craft count"],
                  ["SplitVault", "what each author has earned, and can withdraw"],
                  ["Allowance", "the agent's spending cap, and the human signature needed to raise it"],
                ].map(([name, what]) => (
                  <div key={name}>
                    <dt className="font-mono text-sm text-amber">{name}</dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-dim">
                      {what}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm text-faint">
                Deliberately small. Details in{" "}
                <code className="font-mono">docs/ONCHAIN.md</code>.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <div className="slot p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-sm">market_stall</p>
                <span className="label !text-sap">crafted 41×</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-bench-700 pt-4">
                <span className="text-sm text-dim">recipe by @author</span>
                <span className="font-mono text-amber">0.002 USDC / craft</span>
              </div>
              <p className="label mt-4">illustrative — the contract lands Wednesday</p>
            </div>
            <p className="max-w-md self-center text-sm leading-relaxed text-faint">
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
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2">
          <p className="label">Voxel Bench · ETHOnline 2026</p>
          <p className="label !text-faint">built from scratch · see AI_USAGE.md</p>
        </div>
      </footer>
    </div>
  );
}

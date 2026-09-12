import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Bench from "./components/Bench";
import BenchStatus from "./components/BenchStatus";
import Marketplace from "./components/Marketplace";
import { HeaderWallet } from "./components/Wallet";
import MarketplaceModal from "./components/MarketplaceModal";
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
      <div className="border-b border-bench-700 bg-bench-900 px-5 py-2 text-center">
        <p className="label !text-amber">
          Prototype · the crafter runs on a real machine, not here · your
          agent pays each stage from your budget, on Hedera and Arc testnets
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
          <MarketplaceModal />
          <HeaderWallet />
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
          straight to your own Roblox account, and pays for each step from a
          budget you give it with one signature. You install nothing.
        </p>
        <p className="mt-4 max-w-xl leading-relaxed text-faint">
          Objects and playable obbies work today, and every recipe has an owner
          who earns when someone else crafts it. Objects that act on their own
          are next.
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
            ["~7s", "to craft in Blender"],
            ["0.006", "USDC a craft"],
            ["0", "gas for you"],
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

          <ol className="mt-10 grid gap-px border border-bench-700 bg-bench-700 sm:grid-cols-2 lg:grid-cols-4">
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
              <h3 className="font-semibold">Two cents in, ninety out</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                A craft should cost cents, and a card cannot process two cents
                for less than two cents. The harder half is the other
                direction: paying forty authors ninety cents each, in twenty
                countries, costs more in fees and onboarding than it moves.
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
              <h3 className="font-semibold">The agent&rsquo;s limits are not a prompt</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                You give your agent a budget by signing a USDC permit, and the
                token refuses it anything past that. The platform&rsquo;s own
                cap is a contract too. Neither is a setting the model could be
                talked past — a prepaid card, not your credit card.
              </p>
            </div>
          </div>

          {/* the mechanism, briefly */}
          <div className="mt-px grid gap-px border border-bench-700 bg-bench-700 lg:grid-cols-[1fr_minmax(0,22rem)]">
            <div className="bg-bench-900 p-6">
              <p className="label mb-4">What actually happens on a craft</p>
              <ol className="space-y-2.5 font-mono text-sm">
                {[
                  ["1", "you pay your agent, from your budget", "USDC · Arc"],
                  ["2", "the agent pays the recipe service", "x402 · Hedera"],
                  ["3", "the agent pays the craft service", "Nanopayments · Arc"],
                  ["4", "a recipe with an author pays them 90%", "RecipeBook"],
                  ["5", "publishing, when you ask, is paid the same way", "x402 · Hedera"],
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

          {/* The shelf gets the full width; the note on revenue follows it. */}
          <div className="mt-10">
            <Marketplace />
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faint">
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

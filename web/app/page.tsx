import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Image from "next/image";
import Bench from "./components/Bench";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Reveal from "./components/Reveal";
import Onchain, { OnchainReasons } from "./components/Onchain";
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
    d: "Publish, and it uploads through Open Cloud into your own account, with its render as the icon — it is in your Creator Dashboard. Or build an obby from your recipes and play it in Studio.",
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
            From a sentence to your Roblox account.
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

      {/* ── why onchain ───────────────────────────────────────────────── */}
      {/* The reasons open the section over a wall of lit blocks, kept faint
          and faded into the page's colour at both ends so the text reads over
          it and the part below carries on without a seam. */}
      <section
        id="onchain"
        className="relative overflow-hidden border-t border-bench-700 bg-bench-950"
      >
        <Image
          src="/bg/voxel-wall.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ opacity: 0.45 }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, #131110 0%, rgb(19 17 16 / 0.35) 30%, rgb(19 17 16 / 0.35) 70%, #131110 100%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-16">
          <h2 className="text-2xl font-bold tracking-tight">Why it&rsquo;s paid onchain</h2>
          <p className="mt-2 max-w-lg text-dim">
            Three reasons, none of them decorative.
          </p>

          <OnchainReasons />
        </div>
      </section>

      {/* What happens on a craft, the contracts and the shelf. */}
      <section>
        <div className="mx-auto max-w-6xl px-5 pt-4 pb-20">
          <Onchain />

          {/* The shelf gets the full width, and room under it before the
              sponsors. */}
          <div className="mt-16" style={{ paddingBottom: "3rem" }}>
            <Marketplace />
          </div>

          {/* What it runs on: small, quiet marks, each linking to its own
              site. */}
          <div className="flex flex-col items-center gap-3">
            <p className="label !text-faint">Built with</p>
            <ul className="sponsors">
              {[
                ["Arc", "/sponsors/arc.webp", "https://www.arc.network"],
                ["ENS", "/sponsors/ens.webp", "https://ens.domains"],
                ["Hedera", "/sponsors/hedera.webp", "https://hedera.com"],
              ].map(([name, src, href]) => (
                <li key={name}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    title={name}
                    aria-label={name}
                    className="sponsor"
                  >
                    <Image src={src} alt="" width={40} height={40} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-bench-700 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-2 text-center">
          <p className="label">Voxel Bench · ETHOnline 2026</p>
          <p className="label !text-faint">built from scratch</p>
          <a
            href="https://github.com/ETH-GLOBAL-ONLINE/voxel-bench"
            target="_blank"
            rel="noreferrer"
            className="label flex items-center gap-1.5 !text-faint transition-colors hover:!text-amber"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Source on GitHub
          </a>
        </div>
      </footer>
      </div>
    </div>
  );
}

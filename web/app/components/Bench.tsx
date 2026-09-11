"use client";

import { useEffect, useRef, useState } from "react";
import Viewer from "./Viewer";
import Payments, { type Payment } from "./Payments";
import RobloxConnect, { loadAccount, type RobloxAccount } from "./RobloxConnect";

type Files = { preview: string; glb: string; rbxmx: string; recipe: string };
type Result = {
  name: string;
  ingredients: number;
  parts: number | null;
  tris: number | null;
  studs: number[];
  model: string;
  tokens: number;
  notes: string[];
  files: Files;
};

type Sample = {
  name: string;
  ingredients: number;
  parts?: number;
  tris: number;
  studs: number[];
};
type Published = { assetId: string; moderation: string; insert: string };

// What the craft did to RecipeBook: registered a recipe nobody had, or settled
// against one that already has an owner and paid them.
type Book = {
  id: string;
  action: "published" | "crafted" | "failed";
  author?: string;
  chain?: string;
  transaction?: string;
  crafts?: number;
  paidToAuthor?: string;
  error?: string;
};
type Ledger = {
  payments: Payment[];
  payTo?: string | null;
  network?: string | null;
  discovery?: string | null;
  parent?: string | null;
};

const POLL_MS = 2000;
// The crafter's own deadline is 120s for the recipe plus Blender's time. Give
// up a little after that rather than leaving a spinner running forever.
const GIVE_UP_MS = 210_000;

const IDEAS = [
  "a stone well with a bucket",
  "a rusty oil drum",
  "a market fruit cart",
  "a sci-fi supply crate",
  "a park bench under a lamp",
];

export default function Bench({ sample }: { sample: Sample }) {
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [account, setAccount] = useState<RobloxAccount | null>(null);
  // Kept whole rather than merged into the result, because it is worth watching
  // while the craft runs and worth reading after it finishes.
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [publishLedger, setPublishLedger] = useState<Ledger | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage is not available while rendering on the server.
  useEffect(() => setAccount(loadAccount()), []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pubTimer.current) clearTimeout(pubTimer.current);
  }, []);

  const busy = stage !== null;

  async function craft(e: React.FormEvent) {
    e.preventDefault();
    if (busy || prompt.trim().length < 3) return;

    setError(null);
    setResult(null);
    setPublished(null);
    setPublishError(null);
    setLedger(null);
    setPublishLedger(null);
    setBook(null);
    setElapsed(0);
    setStage("sending it to the bench");

    let job: string;
    try {
      const res = await fetch("/api/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "the bench refused");
      job = data.job;
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : "could not reach the bench");
      return;
    }

    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > GIVE_UP_MS) {
        setStage(null);
        setError("This took too long. The bench may be overloaded.");
        return;
      }
      try {
        const res = await fetch(`/api/craft/${job}`, { cache: "no-store" });
        const data = await res.json();
        if (data.payments) {
          setLedger({
            payments: data.payments,
            payTo: data.payTo,
            network: data.network,
            discovery: data.discovery,
            parent: data.parent,
          });
        }
        if (data.status === "done") {
          setStage(null);
          setResult(data.result);
          if (data.book) setBook(data.book);
          return;
        }
        if (data.status === "failed") {
          setStage(null);
          setError(data.error ?? "the craft failed");
          return;
        }
        setStage(data.stage ?? "working");
        setElapsed(data.elapsed ?? 0);
      } catch {
        // a dropped poll is not a failed craft; try again
      }
      timer.current = setTimeout(poll, POLL_MS);
    };
    timer.current = setTimeout(poll, POLL_MS);
  }

  async function publish() {
    if (!result || publishing) return;
    setPublishError(null);
    setPublishing("sending it to Roblox");

    let job: string;
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: result.name,
          apiKey: account?.apiKey,
          userId: account?.userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Roblox refused it");
      job = data.job;
    } catch (err) {
      setPublishing(null);
      setPublishError(err instanceof Error ? err.message : "could not publish");
      return;
    }

    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 120_000) {
        setPublishing(null);
        setPublishError("Roblox is taking too long to answer.");
        return;
      }
      try {
        const res = await fetch(`/api/craft/${job}`, { cache: "no-store" });
        const data = await res.json();
        if (data.payments) {
          setPublishLedger({
            payments: data.payments,
            payTo: data.payTo,
            network: data.network,
            discovery: data.discovery,
            parent: data.parent,
          });
        }
        if (data.status === "done") {
          setPublishing(null);
          setPublished(data.result);
          return;
        }
        if (data.status === "failed") {
          setPublishing(null);
          setPublishError(data.error ?? "the upload failed");
          return;
        }
        setPublishing(data.stage ?? "publishing");
      } catch {
        // a dropped poll is not a failed upload
      }
      pubTimer.current = setTimeout(poll, 1500);
    };
    pubTimer.current = setTimeout(poll, 1500);
  }

  const shown = result
    ? {
        name: result.name,
        ingredients: result.ingredients,
        parts: result.parts,
        tris: result.tris,
        studs: result.studs,
        preview: `/api/out/${result.name}_preview.png`,
        glb: `/api/out/${result.name}.glb`,
        rbxmx: `/api/out/${result.name}.rbxmx`,
      }
    : {
        name: sample.name,
        ingredients: sample.ingredients,
        parts: sample.parts ?? sample.ingredients,
        tris: sample.tris,
        studs: sample.studs,
        preview: `/api/out/${sample.name}_preview.png`,
        glb: `/api/out/${sample.name}.glb`,
        rbxmx: `/api/out/${sample.name}.rbxmx`,
      };

  return (
    <div>
      <div className="mb-4">
        <RobloxConnect account={account} onChange={setAccount} />
      </div>

      <form onSubmit={craft} className="slot flex flex-wrap gap-3 p-4">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a stone well with a bucket"
          maxLength={280}
          disabled={busy}
          className="min-w-0 flex-1 border border-bench-700 bg-bench-950 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-amber/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || prompt.trim().length < 3}
          className="bg-amber px-6 py-2.5 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Crafting…" : "Craft"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="label">try</span>
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={busy}
            onClick={() => setPrompt(idea)}
            className="border border-bench-700 px-2.5 py-1 text-xs text-dim transition-colors hover:border-bench-600 hover:text-ink disabled:opacity-40"
          >
            {idea}
          </button>
        ))}
      </div>

      {busy && (
        <p className="mt-4 flex items-center gap-2.5 font-mono text-sm text-amber">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
          {stage}… {elapsed > 0 && `${elapsed}s`}
          <span className="text-faint">
            — the model writes a recipe, then Blender crafts it
          </span>
        </p>
      )}

      {ledger && (
        <Payments
          payments={ledger.payments}
          payTo={ledger.payTo}
          network={ledger.network}
          discovery={ledger.discovery}
          parent={ledger.parent}
        />
      )}

      {/* Paying for the work and paying the author are different things, so
          they are reported separately rather than merged into one number. */}
      {book && book.action !== "failed" && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-dim">
            {book.action === "published"
              ? "New recipe, recorded on RecipeBook."
              : `Crafted from an existing recipe — ${book.paidToAuthor} to its author.`}
          </span>
          {book.transaction && book.chain && (
            <a
              href={
                book.chain.startsWith("Arc")
                  ? `https://testnet.arcscan.app/tx/${book.transaction}`
                  : `https://hashscan.io/testnet/transaction/${book.transaction}`
              }
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
            >
              {book.transaction.slice(0, 14)}…
            </a>
          )}
        </p>
      )}

      {error && (
        <p className="mt-4 border-l-2 border-ember pl-3 text-sm text-ember">
          {error}
        </p>
      )}

      {result?.notes?.length ? (
        <ul className="mt-4 space-y-1">
          {result.notes.map((n) => (
            <li key={n} className="text-sm text-faint">
              note: {n}
            </li>
          ))}
        </ul>
      ) : null}

{/* Until something has been crafted the panel shows the sample, and the
          sample is hand-authored rather than model output. Saying so is not a
          disclaimer — it is the claim: the same format, converter and Roblox
          parts serve six ingredients and four thousand. */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        {result ? (
          <p className="text-dim">
            Crafted just now:{" "}
            <code className="font-mono text-sm text-amber">{shown.name}</code>
          </p>
        ) : (
          <p className="max-w-xl text-dim">
            <span className="text-ink">Where this is going.</span>{" "}
            {shown.ingredients.toLocaleString()} ingredients, hand-authored in
            the same recipe format a prompt produces. Same primitives, same
            converter, same Roblox parts.
          </p>
        )}
        <p className="label">the grey figure is 5 studs — one Roblox character</p>
      </div>

      <div className="mt-4 grid gap-px border border-bench-700 bg-bench-700 lg:grid-cols-2">
        <figure className="slot !border-0 p-4">
          <figcaption className="label mb-3">Preview render</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={shown.preview}
            src={shown.preview}
            alt={`preview of ${shown.name}`}
            className="w-full border border-bench-700"
          />
        </figure>
        <div className="slot !border-0 p-4">
          <p className="label mb-3">GLB in your browser</p>
          <div className="h-[340px] border border-bench-700 sm:h-[420px]">
            <Viewer key={shown.glb} src={shown.glb} />
          </div>
        </div>
      </div>

      <dl className="mt-px grid grid-cols-2 gap-px border border-bench-700 bg-bench-700 sm:grid-cols-5">
        {[
          ["ingredients", String(shown.ingredients)],
          ["triangles", shown.tris ? String(shown.tris) : "—"],
          ["studs", shown.studs.map((v) => v.toFixed(1)).join(" × ")],
          ["vs player", `${(shown.studs[2] / 5).toFixed(1)}×`],
          // An ingredient is usually one part and a cone is four, so these
          // two are no longer the same number.
          ["parts", shown.parts ? String(shown.parts) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-bench-900 px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className="mt-1 font-mono text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Publishing is the point: it lands in your account, you install
          nothing. Downloading the file is the fallback, and looks like one. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          onClick={publish}
          disabled={
            !result || !account || publishing !== null || published !== null
          }
          className="bg-amber px-5 py-2.5 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !result
              ? "Craft something first"
              : !account
                ? "Connect a Roblox account first"
                : undefined
          }
        >
          {published
            ? "Published"
            : publishing
              ? "Publishing…"
              : "Publish to Roblox"}
        </button>

        {result && !account && (
          <span className="text-sm text-faint">
            Connect an account above to publish it.
          </span>
        )}

        {publishing && (
          <span className="flex items-center gap-2 font-mono text-sm text-amber">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
            {publishing}…
          </span>
        )}

        <a href={shown.rbxmx} className="text-xs text-faint hover:text-dim">
          or download the .rbxmx
        </a>
      </div>

      {publishLedger && (
        <Payments
          payments={publishLedger.payments}
          payTo={publishLedger.payTo}
          network={publishLedger.network}
          discovery={publishLedger.discovery}
          parent={publishLedger.parent}
        />
      )}

      {publishError && (
        <p className="mt-4 border-l-2 border-ember pl-3 text-sm text-ember">
          {publishError}
        </p>
      )}

      {published && (
        <div className="slot mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm">
              asset <span className="text-amber">{published.assetId}</span>
            </p>
            <span className="label !text-sap">
              moderation {published.moderation?.toLowerCase()}
            </span>
          </div>
          <p className="mt-3 text-sm text-dim">
            It is in your Roblox inventory. Open Studio and find it under
            Toolbox, Inventory, My Models.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-faint hover:text-dim">
              or insert it with one line
            </summary>
            <code className="mt-2 block overflow-x-auto border border-bench-700 bg-bench-950 px-3 py-2 font-mono text-xs text-dim">
              {published.insert}
            </code>
            <p className="mt-2 text-xs text-faint">
              Paste that into the command bar at the bottom of Studio.
            </p>
          </details>
        </div>
      )}

      {result && (
        <p className="label mt-4">
          {result.model} · {result.tokens} tokens · native Roblox parts, so it
          arrives at the right size and colour
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Viewer from "./Viewer";
import Payments, { type Bill, type LogEntry, type Payment } from "./Payments";
import RobloxConnect, { loadAccount, type RobloxAccount } from "./RobloxConnect";
import Wallet, { short, useWallet } from "./Wallet";
import ObbyBuilder from "./ObbyBuilder";
import LogoLoader from "./LogoLoader";
import SpendingCap from "./SpendingCap";
import Budget, { budgetChanged } from "./Budget";
import {
  bringIntoView,
  skipTour,
  Spotlight,
  TourBubble,
  TOUR_EVENTS,
  TOUR_NEXT,
  TOUR_STEPS,
  tourOn,
} from "./Tour";

type Files = { preview: string; glb: string; rbxmx: string; recipe: string };
type Result = {
  name: string;
  recipe?: unknown;
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
type Published = {
  assetId: string;
  moderation: string;
  insert: string;
  // The render, uploaded as the model's icon.
  icon?: { set: boolean; imageAssetId?: string | null; error?: string | null } | null;
};

// What the craft did to RecipeBook: registered a recipe nobody had, or settled
// against one that already has an owner and paid them.
type Book = {
  id: string;
  action: "published" | "crafted" | "unclaimed" | "failed";
  relayed?: boolean;
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
  // Every step behind the payments, and what the person paid for the job.
  log?: LogEntry[];
  bill?: Bill | null;
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
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [mode, setMode] = useState<"describe" | "obby">("describe");
  // The guide's second step, pointing at the prompt once a budget is set.
  const [describeTour, setDescribeTour] = useState(false);
  const promptInput = useRef<HTMLInputElement>(null);
  // Steps three and five: claim what was made, then publish it.
  const [claimTour, setClaimTour] = useState(false);
  // Step three is armed when a craft finishes. It waits for the visitor to
  // scroll down to the render, gives them five seconds with it, and only then
  // takes them back up to the claim — so the payment log and the object itself
  // are both seen first.
  const [claimArmed, setClaimArmed] = useState(false);
  const renderArea = useRef<HTMLDivElement>(null);
  const [publishTour, setPublishTour] = useState(false);
  // Step five points at the obby tab and goes when it is opened; the obby is
  // then built without the guide. Its render, seen for a moment, brings step
  // six: connect Roblox and publish.
  const [obbyTour, setObbyTour] = useState(false);
  const [publishArmed, setPublishArmed] = useState(false);
  const building = useRef(false);
  const tabsArea = useRef<HTMLDivElement>(null);
  const claimArea = useRef<HTMLDivElement>(null);
  const publishArea = useRef<HTMLDivElement>(null);
  const wallet = useWallet();

  const RENDER_PAUSE_MS = 5000;
  useEffect(() => {
    if (!claimArmed || !renderArea.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || timer) return;
        watcher.disconnect();
        timer = setTimeout(() => {
          setClaimArmed(false);
          if (!tourOn()) return;
          setClaimTour(true);
          bringIntoView(claimArea.current);
        }, RENDER_PAUSE_MS);
      },
      { threshold: 0.5 },
    );
    watcher.observe(renderArea.current);
    return () => {
      watcher.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [claimArmed]);

  // Step five arrives from the backpack, once it has been seen.
  useEffect(() => {
    const next = () => {
      if (!tourOn()) return;
      setObbyTour(true);
      setTimeout(() => bringIntoView(tabsArea.current), 60);
    };
    window.addEventListener(TOUR_EVENTS.obby, next);
    return () => window.removeEventListener(TOUR_EVENTS.obby, next);
  }, []);

  // Step six: the obby's render has been on screen for a moment, then on to
  // publishing it — the end of the path.
  useEffect(() => {
    if (!publishArmed || !renderArea.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || timer) return;
        watcher.disconnect();
        timer = setTimeout(() => {
          setPublishArmed(false);
          if (!tourOn()) return;
          setPublishTour(true);
          bringIntoView(publishArea.current);
        }, RENDER_PAUSE_MS);
      },
      { threshold: 0.5 },
    );
    watcher.observe(renderArea.current);
    return () => {
      watcher.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [publishArmed]);

  useEffect(() => {
    const next = () => {
      if (!tourOn()) return;
      setMode("describe");
      setDescribeTour(true);
      setTimeout(() => {
        bringIntoView(promptInput.current?.form ?? null);
        promptInput.current?.focus({ preventScroll: true });
      }, 60);
    };
    window.addEventListener(TOUR_NEXT, next);
    return () => window.removeEventListener(TOUR_NEXT, next);
  }, []);
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
    setDescribeTour(false);
    await startCraft({ prompt, payer: wallet.address });
  }

  /** Start a craft and follow it: a sentence, or the pieces of an obby. */
  async function startCraft(body: Record<string, unknown>) {
    if (busy) return;
    setError(null);
    setResult(null);
    setPublished(null);
    setPublishError(null);
    setLedger(null);
    setPublishLedger(null);
    setBook(null);
    setClaimError(null);
    setClaimTour(false);
    setClaimArmed(false);
    setPublishArmed(false);
    setElapsed(0);
    setStage("sending it to the bench");
    const isObby = Array.isArray(body.obby);

    let job: string;
    try {
      const res = await fetch("/api/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
            log: data.log,
            bill: data.bill,
          });
        }
        if (data.status === "done") {
          setStage(null);
          setResult(data.result);
          if (data.book) setBook(data.book);
          budgetChanged();
          // The obby built during the guide leads to publishing; anything else
          // new and unowned leads to claiming it.
          if (tourOn()) {
            if (isObby && building.current) setPublishArmed(true);
            else if (data.book?.action === "unclaimed") setClaimArmed(true);
          }
          return;
        }
        if (data.status === "failed") {
          setStage(null);
          setError(data.error ?? "the craft failed");
          budgetChanged();
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

  /**
   * Take ownership of the recipe just crafted.
   *
   * The agent says what to sign, the wallet signs it, and the agent relays it
   * and pays the gas. Nothing here needs a funded account, which is the point:
   * an address created a minute ago can own what it made.
   */
  async function claim() {
    if (!result?.recipe || !book?.id || !wallet.address || claiming) return;
    setClaimError(null);
    setClaiming(true);

    try {
      const ask = await fetch(
        `/api/claim?id=${book.id}&author=${wallet.address}`,
        { cache: "no-store" },
      );
      const typed = await ask.json();
      if (!ask.ok) throw new Error(typed.error ?? "could not prepare the claim");

      const signature = await wallet.signTypedData(typed);
      if (!signature) {
        setClaiming(false);
        return; // declined, which is an answer
      }

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe: result.recipe,
          author: wallet.address,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "the claim was refused");
      setBook(data);
      // Claimed during the guide — or before the scroll that would have
      // shown step three: on to the backpack, where it now is.
      if (claimTour || claimArmed) {
        setClaimTour(false);
        setClaimArmed(false);
        window.dispatchEvent(new Event(TOUR_EVENTS.backpack));
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "the claim failed");
    } finally {
      setClaiming(false);
    }
  }

  async function publish() {
    if (!result || publishing) return;
    setPublishTour(false);
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
          payer: wallet.address,
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
      // The model, then the render as its icon: two uploads and two waits.
      if (Date.now() - started > 240_000) {
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
            log: data.log,
            bill: data.bill,
          });
        }
        if (data.status === "done") {
          setPublishing(null);
          setPublished(data.result);
          budgetChanged();
          return;
        }
        if (data.status === "failed") {
          setPublishing(null);
          setPublishError(data.error ?? "the upload failed");
          budgetChanged();
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
      <p className="mb-3 flex flex-wrap items-center gap-x-2">
        <Wallet />
      </p>

      {/* The first step of the happy path: before anything is crafted, the
          agent is given a budget of the visitor's own. */}
      <Budget />

      <div
        ref={tabsArea}
        className={`relative mb-3 flex gap-5 border-b border-bench-700 ${obbyTour ? "z-40" : ""}`}
      >
        {obbyTour && (
          <>
            <Spotlight
              onClose={() => {
                skipTour();
                setObbyTour(false);
              }}
            />
            <TourBubble
              step={5}
              total={TOUR_STEPS}
              title="Now build an obby."
              onDismiss={() => {
                skipTour();
                setObbyTour(false);
              }}
            >
              Open Build an obby and pick pieces from your backpack and the
              marketplace, in the order a player runs them. The course pays
              every piece&apos;s author.
            </TourBubble>
          </>
        )}
        {(["describe", "obby"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(m);
              // Opening the obby ends step five; the obby is built unguided.
              if (m === "obby" && obbyTour) {
                setObbyTour(false);
                building.current = true;
              }
            }}
            className={`border-b-2 px-1 pb-1 text-xs transition-colors disabled:opacity-40 ${
              mode === m
                ? "border-amber text-ink"
                : "border-transparent text-faint hover:text-dim"
            } ${obbyTour && m === "obby" ? "tour-breathe bg-bench-900 px-2 !text-amber" : ""}`}
          >
            {m === "describe" ? "Describe an object" : "Build an obby"}
          </button>
        ))}
      </div>

      {mode === "obby" ? (
        <ObbyBuilder busy={busy} onCraft={(ids) =>
            startCraft({ obby: ids, collector: wallet.address, payer: wallet.address })
          } />
      ) : (
      <form
        onSubmit={craft}
        className={`slot relative flex flex-wrap gap-3 p-4 ${describeTour ? "tour-breathe z-40" : ""}`}
      >
        {describeTour && (
          <>
            <Spotlight
              onClose={() => {
                skipTour();
                setDescribeTour(false);
              }}
            />
            <TourBubble
              step={2}
              total={TOUR_STEPS}
              title="Now describe what you want."
              onDismiss={() => {
                skipTour();
                setDescribeTour(false);
              }}
            >
              One sentence — try &ldquo;a stone well with a bucket&rdquo;. Your
              agent pays each stage from your budget, and you can open every
              step it takes.
            </TourBubble>
          </>
        )}
        <input
          ref={promptInput}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a stone well with a bucket"
          maxLength={280}
          disabled={busy}
          className="min-w-0 flex-1 border border-bench-700 bg-bench-950 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-amber/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || prompt.trim().length < 3 || !wallet.address}
          title={wallet.address ? undefined : "Sign in first: your agent pays with your budget"}
          className="bg-amber px-6 py-2.5 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Crafting…" : "Craft"}
        </button>
        {/* Every job is paid from the visitor's own budget, so crafting starts
            with signing in — with a wallet, an email or a social account. */}
        {!wallet.address && (
          <p className="w-full text-xs text-faint">
            Sign in above to craft — your agent pays with a budget of your own.
          </p>
        )}
      </form>
      )}

      {mode === "describe" && (
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
      )}

      {busy && (
        <p className="mt-4 flex items-center gap-2.5 font-mono text-sm text-amber">
          <LogoLoader inline />
          {stage}… {elapsed > 0 && `${elapsed}s`}
          <span className="text-faint">
            {mode === "obby"
              ? "— the pieces are laid out, Blender crafts the course, and each author is paid"
              : "— the model writes a recipe, then Blender crafts it"}
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
          log={ledger.log}
          bill={ledger.bill}
        />
      )}

      {/* Paying for the work and owning what was made are different things, so
          they are reported separately rather than merged into one number. */}
      {book && book.action !== "failed" && (
        <div
          ref={claimArea}
          className={`relative mt-3 ${claimTour ? "tour-breathe z-40 bg-bench-900 p-3" : ""}`}
        >
        {claimTour && (
          <>
            <Spotlight
              onClose={() => {
                skipTour();
                setClaimTour(false);
              }}
            />
            <TourBubble
              step={3}
              total={TOUR_STEPS}
              title="Claim it — make it yours."
              onDismiss={() => {
                skipTour();
                setClaimTour(false);
              }}
              // Not claiming is an answer too: the guide carries on without it.
              action={{
                label: "Next step →",
                onClick: () => {
                  setClaimTour(false);
                  window.dispatchEvent(
                    new CustomEvent(TOUR_EVENTS.backpack, { detail: { claimed: false } }),
                  );
                },
              }}
            >
              Sign a message: no gas, no transaction. RecipeBook records you as
              its author, and you earn 90% every time someone crafts it.
            </TourBubble>
          </>
        )}
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-dim">
            {book.action === "unclaimed" &&
              "Nobody owns this recipe yet. Claim it and you earn when others craft with it."}
            {book.action === "published" &&
              `Yours — recorded on RecipeBook under ${short(book.author ?? "")}.`}
            {book.action === "crafted" &&
              `Crafted from an existing recipe — ${book.paidToAuthor} to its author.`}
          </span>

          {book.action === "unclaimed" &&
            (wallet.address ? (
              <button
                type="button"
                onClick={claim}
                disabled={claiming}
                className="border border-amber/50 px-2.5 py-1 text-xs text-amber transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {claiming ? "signing…" : "Claim this recipe"}
              </button>
            ) : (
              <span className="label !text-faint">
                {wallet.kind === "privy"
                  ? "sign in above to claim it"
                  : "connect a wallet above to claim it"}
              </span>
            ))}
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
        </div>
      )}

      {claimError && (
        <p className="mt-2 text-sm text-ember">{claimError}</p>
      )}

      {error && (
        <p className="mt-4 border-l-2 border-ember pl-3 text-sm text-ember">
          {error}
        </p>
      )}

      {/* Folded: an obby earns a note per piece and per cone, which buried
          the result. The count says there is something to open. */}
      {result?.notes?.length ? (
        <details className="mt-4">
          <summary className="label cursor-pointer select-none !text-faint transition-colors hover:!text-dim">
            {result.notes.length === 1 ? "1 note" : `${result.notes.length} notes`} on this craft
          </summary>
          <ul className="mt-2 space-y-1">
            {/* Keyed by position: two ingredients can earn the same note, and
                the text is then not unique. */}
            {result.notes.map((n, i) => (
              <li key={`${i}-${n}`} className="text-sm text-faint">
                note: {n}
              </li>
            ))}
          </ul>
        </details>
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
            {shown.ingredients.toLocaleString()} ingredients, in the same recipe
            format a prompt writes.
          </p>
        )}
        <p className="label">the grey figure is 5 studs — one Roblox character</p>
      </div>

      <div
        ref={renderArea}
        className="mt-4 grid gap-px border border-bench-700 bg-bench-700 lg:grid-cols-2"
      >
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
          {/* Square, like the render beside it, so the two panels match. */}
          <div className="aspect-square w-full border border-bench-700">
            {/* Closer only for the sample garden, which is huge; a crafted
                object keeps its frame. */}
            <Viewer key={shown.glb} src={shown.glb} closer={!result} />
          </div>
        </div>
      </div>

      {/* A compact wrapped line on a phone, five cells from 640px up; the
          layout lives in globals.css (.specs). */}
      <dl className="specs">
        {[
          ["ingredients", String(shown.ingredients)],
          ["triangles", shown.tris ? String(shown.tris) : "—"],
          ["studs", shown.studs.map((v) => v.toFixed(1)).join(" × ")],
          ["vs player", `${(shown.studs[2] / 5).toFixed(1)}×`],
          // An ingredient is usually one part and a cone is four, so these
          // two are no longer the same number.
          ["parts", shown.parts ? String(shown.parts) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="spec">
            <dt className="label">{k}</dt>
            <dd className="font-mono text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Connecting Roblox belongs with publishing, after the thing to
          publish exists — not before anything has been made. */}
      <div
        ref={publishArea}
        className={`relative mt-6 ${publishTour ? "tour-breathe z-40 bg-bench-900 p-3" : ""}`}
      >
        {publishTour && (
          <>
            <Spotlight
              onClose={() => {
                skipTour();
                setPublishTour(false);
              }}
            />
            <TourBubble
              step={6}
              total={TOUR_STEPS}
              title={account ? "Publish it to Roblox." : "Connect Roblox, then publish."}
              onDismiss={() => {
                skipTour();
                setPublishTour(false);
              }}
            >
              {account
                ? "It goes straight to your Roblox account as native parts. Then find it in your Creator Dashboard, under Creations."
                : "Paste an Open Cloud key — it stays in this browser. Then Publish puts it straight into your Roblox account."}
            </TourBubble>
          </>
        )}

        <div className="mb-4">
          <RobloxConnect account={account} onChange={setAccount} />
        </div>

      {/* Publishing is the point: it lands in your account, you install
          nothing. Downloading the file is the fallback, and looks like one. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
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
            <LogoLoader inline />
            {publishing}…
          </span>
        )}

        <a href={shown.rbxmx} className="text-xs text-faint hover:text-dim">
          or download the .rbxmx
        </a>
      </div>
      </div>

      {publishLedger && (
        <Payments
          payments={publishLedger.payments}
          payTo={publishLedger.payTo}
          network={publishLedger.network}
          discovery={publishLedger.discovery}
          parent={publishLedger.parent}
          log={publishLedger.log}
          bill={publishLedger.bill}
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
          {/* The agent has already published it: the first thing to offer is
              where it now is, so nobody opens Studio to publish it again. */}
          <p className="mt-3 text-sm text-dim">
            Done — it is published to your Roblox account. Find it in the
            Creator Dashboard under Creations → Development Items → Models.
          </p>
          <a
            href="https://create.roblox.com/dashboard/creations"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block bg-amber px-4 py-2 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90"
          >
            Open the Creator Dashboard ↗
          </a>
          {published.icon && (
            <p
              className={`mt-3 text-xs ${published.icon.set ? "text-sap" : "text-ember"}`}
            >
              {published.icon.set
                ? `Its icon is the render, uploaded as image ${published.icon.imageAssetId}.`
                : `The model is up, but its icon could not be set: ${published.icon.error ?? "unknown error"}`}
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-faint hover:text-dim">
              or use it in Studio
            </summary>
            <p className="mt-2 text-xs text-faint">
              It is in your inventory: Toolbox → Inventory → My Models. Or paste
              this into the command bar at the bottom of Studio:
            </p>
            <code className="mt-2 block overflow-x-auto border border-bench-700 bg-bench-950 px-3 py-2 font-mono text-xs text-dim">
              {published.insert}
            </code>
          </details>
        </div>
      )}

      {result && (
        <p className="label mt-4">
          {result.model} · {result.tokens} tokens · native Roblox parts, so it
          arrives at the right size and colour
        </p>
      )}

      {/* The platform's own brake, shared by everyone. It is not part of
          crafting something, so it sits after the result rather than between
          the prompt and what the prompt made. */}
      <div className="mt-8">
        <SpendingCap />
      </div>
    </div>
  );
}

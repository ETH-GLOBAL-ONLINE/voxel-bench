"use client";

// The backpack: what the signed-in address made, and what it got.
//
// It asks /api/backpack. What you made — your recipes — is read from the
// chains. What you got from the marketplace is noted by the agent that crafted
// it for you, because today the agent pays and the chain sees the agent. Nothing
// here decides what is whose; the page only shows it.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { short, useWallet } from "./walletCore";
import { skipTour, Spotlight, TourBubble, TOUR_EVENTS, TOUR_STEPS, tourOn } from "./Tour";
import { BackpackIcon, DockButton } from "./DockButton";
import LogoLoader from "./LogoLoader";

type Item = {
  id: string;
  chain: string;
  explorer: string;
  crafts: number;
  earned: string;
  name: string | null;
  preview: string | null;
  ingredients: number | null;
};

type Got = {
  id: string;
  chain: string | null;
  transaction: string | null;
  at: string;
  name: string | null;
  preview: string | null;
};

const txLink = (chain: string | null, tx: string) =>
  chain?.startsWith("Hedera")
    ? `https://hashscan.io/testnet/transaction/${tx}`
    : `https://testnet.arcscan.app/tx/${tx}`;

function Picture({ src, alt, fallback }: { src: string | null; alt: string; fallback: string }) {
  return (
    <div className="aspect-square bg-bench-950">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-xs text-faint">
          {fallback}
        </div>
      )}
    </div>
  );
}

export default function Backpack() {
  const { address } = useWallet();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"created" | "collected">("created");
  const [items, setItems] = useState<Item[] | null>(null);
  const [collected, setCollected] = useState<Got[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!address) return;
    setItems(null);
    setError(null);
    setUnreadable([]);
    try {
      const res = await fetch(`/api/backpack?address=${address}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not read the backpack");
      setItems(data.items);
      setCollected(data.collected ?? []);
      setUnreadable(data.unreadable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not read the backpack");
    }
  }, [address]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // The guide's fourth step: once something is claimed, point here. Opening
  // the backpack and closing it again moves the guide on to the obby.
  const [tour, setTour] = useState(false);
  const advance = useRef(false);
  // Whether something was just claimed, which decides what the note promises.
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    const show = (e: Event) => {
      setFresh((e as CustomEvent<{ claimed?: boolean }>).detail?.claimed !== false);
      if (tourOn()) setTour(true);
    };
    window.addEventListener(TOUR_EVENTS.backpack, show);
    return () => window.removeEventListener(TOUR_EVENTS.backpack, show);
  }, []);

  useEffect(() => {
    if (!open && advance.current) {
      advance.current = false;
      window.dispatchEvent(new Event(TOUR_EVENTS.obby));
    }
  }, [open]);

  // This step is about a button in the dock, so the dock stays above the dim.
  useEffect(() => {
    if (!tour) return;
    document.documentElement.classList.add("tour-dock");
    return () => document.documentElement.classList.remove("tour-dock");
  }, [tour]);

  const openIt = () => {
    if (tour) {
      setTour(false);
      advance.current = true;
    }
    setOpen(true);
  };

  const skip = () => {
    skipTour();
    setTour(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!address) return null;

  const tab = (which: "created" | "collected", label: string, count: number | null) => (
    <button
      type="button"
      onClick={() => setView(which)}
      className={`border-b-2 px-1 pb-1 text-xs transition-colors ${
        view === which ? "border-amber text-ink" : "border-transparent text-faint hover:text-dim"
      }`}
    >
      {label}
      {count !== null ? ` · ${count}` : ""}
    </button>
  );

  return (
    <>
      <span className={`relative inline-block ${tour ? "z-40" : ""}`}>
        <DockButton label="Backpack" icon={<BackpackIcon />} onClick={openIt} glowing={tour} />
        {tour && (
          <>
            <Spotlight onClose={skip} />
            <TourBubble
              step={4}
              total={TOUR_STEPS}
              placement="left"
              title="See it in your Backpack."
              onDismiss={skip}
              action={{
                label: "Next: build an obby →",
                onClick: () => {
                  setTour(false);
                  window.dispatchEvent(new Event(TOUR_EVENTS.obby));
                },
              }}
            >
              {fresh
                ? "Everything you made or collected, read from the chain. Your new recipe is under Created, with its preview."
                : "Everything you made or collected, read from the chain. Claim a recipe and it shows up here, under Created."}
            </TourBubble>
          </>
        )}
      </span>

      {/* Rendered into body, not here. The header this button lives in blurs
          what is behind it, and an element with a backdrop filter becomes the
          frame for any fixed element inside it — so a modal rendered in place
          was confined to the header and drawn behind the page. */}
      {open &&
        createPortal(
          <div
            // Its own scroll: the page's smooth scroll leaves it alone.
            data-lenis-prevent
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-16"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Your backpack"
              className="w-full max-w-3xl border border-bench-600 bg-bench-950 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <div>
                  <p className="label">Backpack</p>
                  <p className="mt-1 text-sm text-dim">
                    Recipes owned by{" "}
                    <span className="font-mono text-amber">{short(address)}</span>,
                    read from the chain.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-faint transition-colors hover:text-ink"
                >
                  Close
                </button>
              </div>

              <div className="mb-5 flex gap-5 border-b border-bench-700">
                {tab("created", "Created", items ? items.length : null)}
                {tab("collected", "Collected", items ? collected.length : null)}
              </div>

              {error && <p className="text-sm text-ember">{error}</p>}

              {unreadable.length > 0 && (
                <p className="mb-4 text-sm text-ember">
                  Could not read {unreadable.join(" and ")} just now: the public
                  node is limiting requests.{" "}
                  <button
                    type="button"
                    onClick={load}
                    className="underline decoration-ember/50 underline-offset-2 hover:opacity-80"
                  >
                    Try again
                  </button>
                </p>
              )}

              {!error && !items && <LogoLoader label="reading the chain…" />}

              {view === "created" && items && items.length === 0 && unreadable.length === 0 && (
                <p className="text-sm text-dim">
                  Nothing here yet. Craft something and claim it, and it lands here.
                </p>
              )}

              {view === "created" && items && items.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li
                      key={`${item.chain}-${item.id}`}
                      className="border border-bench-700 bg-bench-900"
                    >
                      <Picture src={item.preview} alt={item.name ?? item.id} fallback={short(item.id)} />
                      <div className="p-3">
                        <p className="text-sm text-ink">
                          {item.name ? item.name.replace(/_/g, " ") : "unnamed recipe"}
                        </p>
                        <p className="label mt-1 !text-faint">{item.chain}</p>
                        <div className="mt-2 flex items-baseline justify-between text-xs">
                          <span className="text-sap">crafted {item.crafts}×</span>
                          <span className="font-mono text-amber">{item.earned}</span>
                        </div>
                        <a
                          href={item.explorer}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block font-mono text-[11px] text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
                        >
                          {short(item.id)}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {view === "collected" && items && collected.length === 0 && (
                <p className="text-sm text-dim">
                  Nothing collected yet. Get something from the Marketplace, and it
                  lands here.
                </p>
              )}

              {view === "collected" && collected.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {collected.map((got, i) => (
                    <li key={`${got.id}-${i}`} className="border border-bench-700 bg-bench-900">
                      <Picture src={got.preview} alt={got.name ?? got.id} fallback={short(got.id)} />
                      <div className="p-3">
                        <p className="text-sm text-ink">
                          {got.name ? got.name.replace(/_/g, " ") : "unnamed recipe"}
                        </p>
                        <p className="label mt-1 !text-faint">
                          {got.chain ?? "—"} · {new Date(got.at).toLocaleDateString()}
                        </p>
                        {got.transaction && (
                          <a
                            href={txLink(got.chain, got.transaction)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block font-mono text-[11px] text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
                          >
                            author paid · {short(got.transaction)}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

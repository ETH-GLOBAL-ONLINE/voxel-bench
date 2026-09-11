"use client";

// The backpack: every recipe the signed-in address owns.
//
// It asks /api/backpack, which reads ownership from the chains and names from
// the catalog. Nothing here decides what is whose; the page only shows it.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { short, useWallet } from "./walletCore";

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

export default function Backpack() {
  const { address } = useWallet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
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
      setUnreadable(data.unreadable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not read the backpack");
    }
  }, [address]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!address) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-dim transition-colors hover:text-ink"
      >
        Backpack
      </button>

      {/* Rendered into body, not here. The header this button lives in blurs
          what is behind it, and an element with a backdrop filter becomes the
          frame for any fixed element inside it — so a modal rendered in place
          was confined to the header and drawn behind the page. */}
      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-16"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Your backpack"
            className="w-full max-w-3xl border border-bench-600 bg-bench-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-baseline justify-between gap-4">
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

            {error && <p className="text-sm text-ember">{error}</p>}

            {!error && !items && <p className="label">reading the chain…</p>}

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

            {items && items.length === 0 && unreadable.length === 0 && (
              <p className="text-sm text-dim">
                Nothing here yet. Craft something and claim it, and it lands here.
              </p>
            )}

            {items && items.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <li
                    key={`${item.chain}-${item.id}`}
                    className="border border-bench-700 bg-bench-900"
                  >
                    <div className="aspect-square bg-bench-950">
                      {item.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.preview}
                          alt={item.name ?? item.id}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-xs text-faint">
                          {short(item.id)}
                        </div>
                      )}
                    </div>
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
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

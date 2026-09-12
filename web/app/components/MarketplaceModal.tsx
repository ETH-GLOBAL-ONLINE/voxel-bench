"use client";

// The marketplace: every published recipe, and a way to get one.
//
// Getting a recipe means the agent crafts it for you from the catalog. No model
// is asked, so it is quick, and RecipeBook pays its author the usual share. The
// platform's own recipes are marked; the rest are what people made and claimed.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { short, useWallet } from "./walletCore";

type Item = {
  id: string;
  author: string;
  chain: string;
  explorer: string;
  crafts: number;
  earned: string;
  platform: boolean;
  name: string | null;
  preview: string | null;
};

type Getting = {
  id: string;
  status: "starting" | "crafting" | "done" | "failed";
  message?: string;
};

export default function MarketplaceModal() {
  const { address, kind, connect } = useWallet();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [getting, setGetting] = useState<Getting | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/marketplace", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "could not read the marketplace");
      setItems(data.items);
      setUnreadable(data.unreadable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not read the marketplace");
    }
  }, []);

  useEffect(() => {
    if (open) {
      setItems(null);
      load();
    }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function get(item: Item) {
    if (!address || (getting && getting.status !== "done" && getting.status !== "failed")) return;
    setGetting({ id: item.id, status: "starting" });
    try {
      const res = await fetch("/api/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId: item.id, collector: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "the bench refused");

      setGetting({ id: item.id, status: "crafting" });
      for (let i = 0; i < 90; i++) {
        await new Promise((wait) => setTimeout(wait, 2000));
        const job = await fetch(`/api/craft/${data.job}`, { cache: "no-store" }).then((r) =>
          r.json(),
        );
        if (job.status === "done") {
          setGetting({
            id: item.id,
            status: "done",
            message: job.book?.paidToAuthor
              ? `In your backpack. Its author has now earned ${job.book.paidToAuthor}.`
              : "In your backpack.",
          });
          load();
          return;
        }
        if (job.status === "failed") throw new Error(job.error ?? "the craft failed");
      }
      throw new Error("The bench took too long to answer.");
    } catch (err) {
      setGetting({
        id: item.id,
        status: "failed",
        message: err instanceof Error ? err.message : "the craft failed",
      });
    }
  }

  const busy = getting && (getting.status === "starting" || getting.status === "crafting");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-dim transition-colors hover:text-ink"
      >
        Marketplace
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-16"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Marketplace"
              className="w-full max-w-5xl border border-bench-600 bg-bench-950 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <div>
                  <p className="label">Marketplace</p>
                  <p className="mt-1 text-sm text-dim">
                    Recipes on the chain, ready to craft. Getting one crafts it
                    for you, and its author is paid.
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

              {!error && !items && <p className="label">reading the chain…</p>}

              {items && items.length === 0 && unreadable.length === 0 && (
                <p className="text-sm text-dim">Nothing published yet.</p>
              )}

              {items && items.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((item) => {
                    const mine = getting?.id === item.id ? getting : null;
                    // Your own recipe is already yours. Getting it would pay you
                    // your own author share and count a craft nobody else made.
                    const yours =
                      Boolean(address) && item.author.toLowerCase() === address!.toLowerCase();
                    return (
                      <li
                        key={`${item.chain}-${item.id}`}
                        className="flex flex-col border border-bench-700 bg-bench-900"
                      >
                        <div className="relative aspect-square bg-bench-950">
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
                          {item.platform && (
                            <span className="absolute left-2 top-2 bg-amber px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bench-950">
                              Voxel Bench
                            </span>
                          )}
                          {yours && (
                            <span className="absolute left-2 top-2 bg-sap px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bench-950">
                              Yours
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <p className="text-sm text-ink">
                            {item.name ? item.name.replace(/_/g, " ") : "unnamed recipe"}
                          </p>
                          <p className="label mt-1 !text-faint">
                            {item.chain} · by{" "}
                            <span className="font-mono normal-case">
                              {item.platform ? "Voxel Bench" : short(item.author)}
                            </span>
                          </p>
                          <div className="mt-2 flex items-baseline justify-between text-xs">
                            <span className="text-sap">crafted {item.crafts}×</span>
                            <span className="font-mono text-amber">{item.earned}</span>
                          </div>

                          <div className="mt-3">
                            {yours ? (
                              <p className="border border-bench-700 px-2.5 py-1.5 text-center text-xs text-faint">
                                Yours · in your backpack
                              </p>
                            ) : address ? (
                              <button
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => get(item)}
                                className="w-full border border-amber/50 px-2.5 py-1.5 text-xs text-amber transition-opacity hover:opacity-80 disabled:opacity-40"
                              >
                                {mine?.status === "starting" || mine?.status === "crafting"
                                  ? "crafting…"
                                  : "Get it"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => connect()}
                                className="w-full border border-bench-600 px-2.5 py-1.5 text-xs text-dim transition-colors hover:text-ink"
                              >
                                {kind === "privy" ? "Sign in to get it" : "Connect to get it"}
                              </button>
                            )}
                            {mine?.message && (
                              <p
                                className={`mt-2 text-xs ${mine.status === "failed" ? "text-ember" : "text-sap"}`}
                              >
                                {mine.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

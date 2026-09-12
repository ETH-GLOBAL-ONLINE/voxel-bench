"use client";

// What RecipeBook holds, read from the chain.
//
// This card used to be a mock with a made-up craft count, and it said so. It
// now shows what is actually published: the recipe's id, who owns it, how often
// it has been crafted and what that has earned them.
//
// The addresses are on the card on purpose. The claim the whole marketplace
// rests on is that an author does not have to audit us — they read the ledger —
// and a card that shows the ledger's address is a card that can be checked.

import { useEffect, useState } from "react";
import LogoLoader from "./LogoLoader";

type Row = {
  id: string;
  author: string;
  crafts: number;
  earned: string;
  chain?: string;
};

type Book = {
  chains?: { chain: string; book: string; explorer: string }[];
  recipes: Row[];
  reason?: string;
};

const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

export default function Marketplace() {
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/recipes")
      .then((r) => r.json())
      .then((d) => alive && setBook(d))
      .catch(() => alive && setBook({ recipes: [], reason: "could not reach the chain" }));
    return () => {
      alive = false;
    };
  }, []);

  if (!book) {
    return (
      <div className="slot p-5">
        <LogoLoader label="reading the ledger…" size={44} />
      </div>
    );
  }

  if (!book.recipes.length) {
    return (
      <div className="slot p-5">
        <p className="text-sm text-dim">Nothing published yet.</p>
        <p className="label mt-2">
          {book.reason ?? "the first craft writes the first recipe"}
        </p>
      </div>
    );
  }

  return (
    <div className="slot p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">
          {book.recipes.length} published across{" "}
          {book.chains?.length ?? 1} chains
        </p>
        <span className="flex flex-wrap gap-x-2">
          {book.chains?.map((c) => (
            <a
              key={c.book}
              href={c.explorer}
              target="_blank"
              rel="noreferrer"
              className="label !text-faint underline decoration-bench-600 underline-offset-2 hover:!text-dim"
            >
              {short(c.book)}
            </a>
          ))}
        </span>
      </div>

      {/* A grid rather than a column: the card has the section's full width,
          and a single column of rows stretched across it reads as empty. */}
      <ol className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
        {/* Keyed by chain too: the same recipe can be published on both. */}
        {book.recipes.map((row) => (
          <li key={`${row.chain}-${row.id}`} className="bg-bench-950 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="font-mono text-xs text-dim">{short(row.id)}</span>
              <span className="label !text-faint">{row.chain}</span>
              <span className="label !text-sap">crafted {row.crafts}×</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-xs text-faint">
                by <span className="font-mono text-dim">{short(row.author)}</span>
              </span>
              <span className="font-mono text-xs text-amber">{row.earned}</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="label mt-4 !text-faint">
        Read from the chain. The author&rsquo;s share is 90% of every craft and
        waits in the vault until they withdraw it.
      </p>
    </div>
  );
}

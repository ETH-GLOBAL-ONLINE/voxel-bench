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

type Row = {
  id: string;
  author: string;
  crafts: number;
  earned: string;
};

type Book = {
  chain?: string;
  book?: string;
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
        <p className="label">reading the ledger…</p>
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
          {book.recipes.length} published on {book.chain}
        </p>
        {book.book && (
          <a
            href={`https://testnet.arcscan.app/address/${book.book}`}
            target="_blank"
            rel="noreferrer"
            className="label !text-faint underline decoration-bench-600 underline-offset-2 hover:!text-dim"
          >
            {short(book.book)}
          </a>
        )}
      </div>

      <ol className="space-y-px">
        {book.recipes.map((row) => (
          <li key={row.id} className="bg-bench-950 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="font-mono text-xs text-dim">{short(row.id)}</span>
              <span className="label !text-sap">
                crafted {row.crafts}×
              </span>
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

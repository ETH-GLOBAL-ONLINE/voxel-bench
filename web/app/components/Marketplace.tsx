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

// Below this many recipes the ledger stands still: a moving column of two
// rows is a column with a gap going round.
const MOVING_FROM = 6;
// Each half of a moving column holds at least this many rows, so the column is
// always taller than its window and the loop has no empty stretch.
const HALF_AT_LEAST = 6;

function Entry({ row, copy = false }: { row: Row; copy?: boolean }) {
  return (
    <li
      aria-hidden={copy || undefined}
      className={`mb-px bg-bench-950 px-3 py-2.5 ${copy ? "ledger-copy" : ""}`}
    >
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
  );
}

// One column of the ledger, sliding by half its own height. The rows after the
// first pass are copies, hidden from screen readers and dropped when motion is
// turned off.
function Column({
  rows,
  reverse = false,
  pace = 1,
  tall = false,
}: {
  rows: Row[];
  reverse?: boolean;
  pace?: number;
  tall?: boolean;
}) {
  const reps = Math.max(1, Math.ceil(HALF_AT_LEAST / rows.length));
  const half = Array.from({ length: reps }, () => rows).flat();
  return (
    <div className={`ledger-window ${tall ? "ledger-tall" : ""}`}>
      <ul
        className={`ledger-col ${reverse ? "ledger-down" : ""}`}
        style={{ animationDuration: `${Math.round(half.length * 5 * pace)}s` }}
      >
        {/* Keyed by position: the same recipe appears more than once here. */}
        {[...half, ...half].map((row, i) => (
          <Entry key={i} row={row} copy={i >= rows.length} />
        ))}
      </ul>
    </div>
  );
}

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
        <p className="label flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inset-0 animate-ping bg-sap opacity-70 motion-reduce:hidden" />
            <span className="relative h-1.5 w-1.5 bg-sap" />
          </span>
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

      {book.recipes.length >= MOVING_FROM ? (
        <>
          {/* Three columns on a wide screen, alternating direction; one on a
              narrow one. */}
          <div className="ledger-wide">
            {[0, 1, 2].map((c) => (
              <Column
                key={c}
                rows={book.recipes.filter((_, i) => i % 3 === c)}
                reverse={c === 1}
                pace={[1, 1.25, 1.1][c]}
              />
            ))}
          </div>
          <div className="ledger-narrow">
            <Column rows={book.recipes} tall />
          </div>
        </>
      ) : (
        <ol className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
          {book.recipes.map((row) => (
            <Entry key={`${row.chain}-${row.id}`} row={row} />
          ))}
        </ol>
      )}

      <p className="label mt-4 !text-faint">
        Read from the chain. The author&rsquo;s share is 90% of every craft and
        waits in the vault until they withdraw it.
      </p>
    </div>
  );
}

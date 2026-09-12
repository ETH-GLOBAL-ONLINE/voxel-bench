"use client";

// Building an obby from recipes that already exist.
//
// The palette holds the pieces: what you own or collected, and the obby set on
// the marketplace. Tapping one adds it to the end of the course; a piece in the
// course is dragged to change its place, and its × takes it out. The agent lays them out with gaps a character can
// jump, crafts the course as one recipe, and pays the author of every piece.

import { useEffect, useState } from "react";
import { useWallet } from "./walletCore";

type Piece = {
  id: string;
  name: string;
  preview: string | null;
  source: "yours" | "collected" | "shelf";
};

const MAX = 12;

const readable = (name: string) => name.replace(/^obby_/, "").replace(/_/g, " ");

export default function ObbyBuilder({
  busy,
  onCraft,
}: {
  busy: boolean;
  onCraft: (ids: string[]) => void;
}) {
  const { address } = useWallet();
  const [palette, setPalette] = useState<Piece[] | null>(null);
  const [course, setCourse] = useState<Piece[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Reordering the course by dragging a piece onto the one it should take the
  // place of.
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    setCourse((c) => {
      const next = [...c];
      const [piece] = next.splice(from, 1);
      next.splice(to, 0, piece);
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [shelf, pack] = await Promise.all([
          fetch(address ? `/api/marketplace?address=${address}` : "/api/marketplace", {
            cache: "no-store",
          }).then((r) => r.json()),
          address
            ? fetch(`/api/backpack?address=${address}`, { cache: "no-store" }).then((r) =>
                r.json(),
              )
            : Promise.resolve(null),
        ]);

        // Yours first, then what you collected, then the obby set on the shelf.
        const seen = new Set<string>();
        const pieces: Piece[] = [];
        const add = (piece: Piece) => {
          if (!piece.name || seen.has(piece.id)) return;
          seen.add(piece.id);
          pieces.push(piece);
        };
        for (const x of pack?.items ?? []) {
          add({ id: x.id, name: x.name, preview: x.preview, source: "yours" });
        }
        for (const x of pack?.collected ?? []) {
          add({ id: x.id, name: x.name, preview: x.preview, source: "collected" });
        }
        for (const x of shelf?.items ?? []) {
          if (x.name?.startsWith("obby_")) {
            add({ id: x.id, name: x.name, preview: x.preview, source: "shelf" });
          }
        }
        if (alive) setPalette(pieces);
      } catch {
        if (alive) setError("Could not read the pieces.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [address]);

  // Distinct marketplace pieces in the course: what this craft buys.
  const toBuy = new Set(course.filter((p) => p.source === "shelf").map((p) => p.id)).size;

  const source = (s: Piece["source"]) =>
    s === "yours" ? "Yours" : s === "collected" ? "Collected" : "Marketplace";

  return (
    <div className="slot p-4">
      <p className="text-sm text-dim">
        Pick pieces in the order a player runs them. The agent lays them out with
        gaps a character can jump, crafts the course, and pays the author of
        every piece.
      </p>

      <div className="mt-4">
        <p className="label mb-2">
          Course · {course.length} of {MAX}
        </p>
        {course.length === 0 ? (
          <p className="text-xs text-faint">Start with a start pad, end with a finish.</p>
        ) : (
          <ol className="flex flex-wrap items-center gap-1.5">
            {course.map((piece, i) => (
              <li key={`${piece.id}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-faint">→</span>}
                <span
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragging(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (dragging === null) return;
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDragLeave={() => setOver((o) => (o === i ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging !== null) move(dragging, i);
                    setDragging(null);
                    setOver(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  title="Drag to move it"
                  className={`flex items-center border text-xs text-amber transition-colors ${
                    busy ? "opacity-40" : "cursor-grab active:cursor-grabbing"
                  } ${dragging === i ? "opacity-40" : ""} ${
                    over === i && dragging !== i
                      ? "border-amber bg-amber/10"
                      : "border-amber/50"
                  }`}
                >
                  <span className="select-none px-2 py-1">
                    <span className="mr-1 text-faint">⋮⋮</span>
                    {readable(piece.name)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    title="Take it out"
                    aria-label={`Take ${readable(piece.name)} out`}
                    onClick={() => setCourse((c) => c.filter((_, k) => k !== i))}
                    className="border-l border-amber/30 px-1.5 py-1 hover:bg-amber/10 disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-4">
        <p className="label mb-2">Pieces</p>
        {error && <p className="text-sm text-ember">{error}</p>}
        {!error && !palette && (
          <p className="label flex items-center gap-2 !text-sap">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sap" />
            reading your backpack and the shelf…
          </p>
        )}
        {palette && palette.length === 0 && (
          <p className="text-xs text-faint">No pieces yet. Get some from the Marketplace.</p>
        )}
        {palette && palette.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {palette.map((piece) => (
              <li key={piece.id}>
                <button
                  type="button"
                  disabled={busy || course.length >= MAX}
                  onClick={() => setCourse((c) => [...c, piece])}
                  className="w-full border border-bench-700 bg-bench-900 text-left transition-colors hover:border-amber/50 disabled:opacity-40"
                >
                  <div className="aspect-square bg-bench-950">
                    {piece.preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={piece.preview}
                        alt={piece.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] text-ink">{readable(piece.name)}</p>
                    <p className="label !text-[9px] !text-faint">{source(piece.source)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toBuy > 0 && (
        <p className="mt-4 text-xs text-dim">
          Crafting this also gets you {toBuy === 1 ? "1 piece" : `${toBuy} pieces`} from
          the marketplace: each author is paid once, and the piece goes into your
          backpack. Pieces you already have are not paid for again.
        </p>
      )}

      {!address && (
        <p className="mt-4 text-xs text-faint">
          Sign in above to craft a course — your agent pays with a budget of your own.
        </p>
      )}

      <button
        type="button"
        disabled={busy || course.length < 2 || !address}
        onClick={() => onCraft(course.map((piece) => piece.id))}
        className="mt-4 bg-amber px-6 py-2.5 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Crafting…" : "Craft this obby"}
      </button>
    </div>
  );
}

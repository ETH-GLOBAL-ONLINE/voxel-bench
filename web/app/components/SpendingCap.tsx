"use client";

// The agent's spending cap, as a number rather than a claim.
//
// Every craft draws what it is about to spend out of the Allowance contract
// first, so when this reaches zero the next craft does not happen. The bar is
// there because "1 HBAR per day" means nothing to someone reading quickly and a
// bar that is nearly full means something immediately.

import { useEffect, useState } from "react";

type Cap = {
  chainName: string;
  address: string;
  explorer: string;
  remaining: string;
  remainingLabel: string;
  cap: string;
  capLabel: string;
  windowSeconds: number;
};

export default function SpendingCap() {
  const [caps, setCaps] = useState<Cap[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/allowance")
      .then((r) => r.json())
      .then((d) => alive && setCaps(d.caps ?? []))
      .catch(() => alive && setCaps([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!caps?.length) return null;

  const hours = Math.round((caps[0].windowSeconds ?? 0) / 3600);

  return (
    <div className="slot mt-4 p-4">
      <p className="label">
        what the agent may spend in {hours} hours — one cap per chain, because a
        cap is a number in a currency
      </p>

      <ul className="mt-3 space-y-3">
        {caps.map((cap) => {
          const left = Number(cap.remaining);
          const total = Number(cap.cap) || 1;
          const share = Math.max(0, Math.min(1, left / total));

          return (
            <li key={cap.address}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-mono text-xs text-dim">
                  {cap.chainName}
                </span>
                <span className="font-mono text-xs text-amber">
                  {cap.remainingLabel} of {cap.capLabel}
                </span>
              </div>
              <div
                className="mt-1.5 h-1 w-full bg-bench-700"
                role="img"
                aria-label={`${cap.remainingLabel} of ${cap.capLabel} remaining on ${cap.chainName}`}
              >
                <div
                  className="h-full bg-amber transition-[width] duration-700"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="label mt-3 !text-faint">
        Drawn before each craft, from{" "}
        {caps.map((cap, i) => (
          <span key={cap.address}>
            {i > 0 && " and "}
            <a
              href={cap.explorer}
              target="_blank"
              rel="noreferrer"
              className="font-mono underline decoration-bench-600 underline-offset-2 hover:text-dim"
            >
              {cap.address.slice(0, 6)}…{cap.address.slice(-4)}
            </a>
          </span>
        ))}
        . At zero the contract refuses and the craft does not happen — the limit
        is not a setting we honour.
      </p>
    </div>
  );
}

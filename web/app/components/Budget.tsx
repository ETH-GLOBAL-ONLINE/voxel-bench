"use client";

// Your agent's budget.
//
// The agent pays for every step of a job, and it pays with your USDC, up to the
// limit you sign for here. Signing is an EIP-2612 permit: it costs nothing, the
// agent relays it and pays the gas, and from then on the USDC contract itself
// refuses the agent anything past the limit. Changing the limit is signing
// again.
//
// The first time someone signs in, a guide points here before anything else:
// the budget is the first step of the happy path, not a setting to find later.

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "./walletCore";
import {
  bringIntoView,
  skipTour,
  Spotlight,
  TourBubble,
  TOUR_NEXT,
  TOUR_STEPS,
} from "./Tour";

type Status = {
  agent: string;
  allowance: string;
  allowanceLabel: string;
  balance: string;
  balanceLabel: string;
};

const LIMITS = ["0.02", "0.05", "0.10"];

// Anything that spends from the budget says so, and this reads it again.
const EVENT = "voxelbench:budget";
export const budgetChanged = () => window.dispatchEvent(new Event(EVENT));

const tourKey = (address: string) => `voxelbench:tour:budget:${address.toLowerCase()}`;
const limitKey = (address: string) => `voxelbench:limit:${address.toLowerCase()}`;

export default function Budget() {
  const { address, signTypedData } = useWallet();
  const [status, setStatus] = useState<Status | null>(null);
  const [limit, setLimit] = useState("0.05");
  const [signed, setSigned] = useState<number | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ explorer: string } | null>(null);
  const [credit, setCredit] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);
  // Closed during this load: the budget is read again every twenty seconds,
  // and that must not bring the guide back.
  const closed = useRef(false);

  const load = useCallback(async () => {
    if (!address) {
      setStatus(null);
      return;
    }
    try {
      const res = await fetch(`/api/budget?owner=${address}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch {
      // A missed reading is shown as the last good one.
    }
  }, [address]);

  useEffect(() => {
    load();
    const again = () => load();
    window.addEventListener(EVENT, again);
    const timer = setInterval(again, 20000);
    return () => {
      window.removeEventListener(EVENT, again);
      clearInterval(timer);
    };
  }, [load]);

  // The limit last signed for, kept in this browser, so the bar has a whole to
  // be a part of. The chain only knows what is left.
  useEffect(() => {
    if (!address) return;
    try {
      const kept = localStorage.getItem(limitKey(address));
      setSigned(kept ? Number(kept) : null);
    } catch {
      setSigned(null);
    }
  }, [address]);

  // Test USDC, once, for an account that holds none — so someone who signed
  // in with an email a minute ago can try this at all.
  useEffect(() => {
    if (!address || !status || asked.current === address) return;
    if (BigInt(status.balance) > 0n) return;
    asked.current = address;
    setCredit("sending you test USDC…");
    fetch("/api/budget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "credit", owner: address }),
    })
      .then((r) => r.json())
      .then((d) => {
        setCredit(d.sent ? `We sent you ${d.amountLabel} of test USDC.` : null);
        load();
      })
      .catch(() => setCredit(null));
  }, [address, status, load]);

  const hasBudget = status ? BigInt(status.allowance) > 0n : false;

  // The guide shows on every load, whatever has happened before, because it is
  // the happy path being demonstrated. With a budget already set it offers the
  // next step instead. `?tour=0` turns it off.
  const [forced, setForced] = useState(true);
  useEffect(() => {
    setForced(new URLSearchParams(window.location.search).get("tour") !== "0");
  }, []);

  // The guide: shown once per address, when the budget first comes into view
  // with nothing set.
  useEffect(() => {
    if (closed.current || !address || !status || (hasBudget && !forced)) {
      setTour(false);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(tourKey(address)) === "1";
    } catch {
      // No storage: show it, and it stays until a budget is set.
    }
    if ((seen && !forced) || !card.current) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTour(true);
          bringIntoView(card.current);
          watcher.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    watcher.observe(card.current);
    return () => watcher.disconnect();
  }, [address, status, hasBudget, forced]);

  const dismiss = () => {
    setTour(false);
    closed.current = true;
    if (!address) return;
    try {
      localStorage.setItem(tourKey(address), "1");
    } catch {
      // Not remembered, then.
    }
  };

  // Skipping here skips the rest of the guide too.
  const skip = () => {
    skipTour();
    dismiss();
  };

  async function setBudget() {
    if (!address || working) return;
    setError(null);
    setDone(null);
    setWorking("preparing");
    try {
      const value = Math.round(Number(limit) * 1e6);
      const ask = await fetch("/api/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "typed", owner: address, value }),
      });
      const typed = await ask.json();
      if (!ask.ok) throw new Error(typed.error ?? "could not prepare the budget");

      setWorking("sign in your wallet — it costs nothing");
      const signature = await signTypedData(typed.typed);
      if (!signature) {
        setWorking(null);
        return; // declined, which is an answer
      }

      setWorking("the agent is recording it on Arc");
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "permit",
          owner: address,
          value: typed.value,
          deadline: typed.deadline,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "the budget was not recorded");

      setDone({ explorer: data.explorer });
      try {
        localStorage.setItem(limitKey(address), String(value));
      } catch {
        // The bar goes without a whole, then.
      }
      setSigned(value);
      // Set during the guide: on to its second step, the prompt.
      if (tour) window.dispatchEvent(new Event(TOUR_NEXT));
      dismiss();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setWorking(null);
    }
  }

  const left = status ? Number(status.allowance) : 0;
  const share = signed ? Math.max(0, Math.min(1, left / signed)) : hasBudget ? 1 : 0;

  return (
    <div
      ref={card}
      id="budget"
      className={`slot relative mb-4 p-4 ${tour ? "tour-breathe z-40" : ""}`}
    >
      {tour && (
        <>
          <Spotlight onClose={skip} />
          <TourBubble
            step={1}
            total={TOUR_STEPS}
            title="Give your agent a budget."
            onDismiss={skip}
            action={
              hasBudget
                ? {
                    label: "Next: describe it →",
                    onClick: () => {
                      dismiss();
                      window.dispatchEvent(new Event(TOUR_NEXT));
                    },
                  }
                : undefined
            }
          >
            It pays for every step with your USDC — never more than the limit
            you sign for here. Pick one below and sign; it costs no gas.
          </TourBubble>
        </>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">your agent&apos;s budget</p>
        {status && (
          <p className="font-mono text-xs text-dim">
            wallet {status.balanceLabel} on Arc
          </p>
        )}
      </div>

      {!address ? (
        <p className="mt-2 text-sm text-dim">
          Sign in above. Your agent pays for each job with your own USDC, up to
          a limit you set — it never spends more.
        </p>
      ) : (
        <>
          {hasBudget ? (
            <div className="mt-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm text-ink">
                  <span className="font-mono text-amber">{status?.allowanceLabel}</span> left
                  for your agent to spend
                </span>
                {signed ? (
                  <span className="font-mono text-xs text-faint">
                    of {(signed / 1e6).toFixed(2)} USDC
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 h-1 w-full bg-bench-700">
                <div
                  className="h-full bg-amber transition-[width] duration-700"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-dim">
              Your agent pays for each job with your USDC. Choose how much it
              may spend, and sign — no gas, no transaction from you.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {LIMITS.map((l) => (
              <button
                key={l}
                type="button"
                disabled={Boolean(working)}
                onClick={() => setLimit(l)}
                className={`border px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-40 ${
                  limit === l
                    ? "border-amber text-amber"
                    : "border-bench-700 text-dim hover:border-bench-600"
                }`}
              >
                {l} USDC
              </button>
            ))}
            <button
              type="button"
              onClick={setBudget}
              disabled={Boolean(working)}
              className="bg-amber px-4 py-1.5 text-xs font-semibold text-bench-950 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {working ? "Setting…" : hasBudget ? "Change the limit" : "Set the limit"}
            </button>
            {working && <span className="font-mono text-xs text-amber">{working}</span>}
          </div>

          {done && (
            <p className="mt-2 text-xs text-sap">
              Recorded on Arc — the agent can spend up to {limit} USDC of yours.{" "}
              <a
                href={done.explorer}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-sap/40 underline-offset-2"
              >
                the permit
              </a>
            </p>
          )}
          {error && <p className="mt-2 text-xs text-ember">{error}</p>}
          {credit && <p className="mt-2 text-xs text-dim">{credit}</p>}

          <p className="label mt-3 !text-faint">
            Test USDC — sent once by Voxel Bench so you can try it, testnet only.
            On mainnet you bring your own. Enforced by the USDC contract: past
            the limit the agent is refused, whoever asks.
          </p>
        </>
      )}
    </div>
  );
}

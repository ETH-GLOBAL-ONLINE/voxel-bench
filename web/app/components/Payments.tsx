"use client";

// What the agent is spending, while it spends it.
//
// Every stage is listed from the start, with its price, before any of them is
// paid for — a price you are told afterwards is not a price. Then each one
// moves quoted → paying → paid as the agent works through them.
//
// Each stage opens into the steps behind it: the request, the 402, the check
// against the name, the signature, the settlement. The one being paid opens by
// itself, so the process is visible while it happens rather than only its
// receipt afterwards.
//
// The transaction id is the point of the whole exercise. Anyone can open it on
// HashScan and see the transfer, which is what separates a payment from a
// claim that one happened.

import { useState } from "react";

export type Payment = {
  stage: string;
  description?: string;
  amount: string;
  network?: string | null;
  label: string;
  status: "quoted" | "paying" | "paid" | "unpaid";
  seconds: number | null;
  transaction: string | null;
  explorer: string | null;
};

export type LogEntry = { t: number; stage: string; text: string; link?: string | null };

export type Bill = {
  items: { item: string; amount: string }[];
  total: string;
  transaction?: string | null;
  explorer?: string | null;
  left?: string | null;
};

const WORD: Record<Payment["status"], string> = {
  quoted: "quoted",
  paying: "paying",
  paid: "paid",
  unpaid: "not charged",
};

// The steps that are not a stage of their own, named for the timeline.
const STEP: Record<string, string> = {
  budget: "your budget",
  cap: "agent's cap",
  book: "RecipeBook",
  pieces: "pieces",
};

function Lines({ entries }: { entries: LogEntry[] }) {
  if (!entries.length) {
    return <p className="px-3 py-2 font-mono text-[11px] text-faint">nothing yet</p>;
  }
  return (
    <ol className="space-y-0.5 px-3 py-2">
      {entries.map((e, i) => (
        <li key={`${i}-${e.t}`} className="flex gap-2 font-mono text-[11px] leading-relaxed">
          <span className="w-12 shrink-0 text-right text-faint">+{e.t.toFixed(1)}s</span>
          <span className="min-w-0 break-words text-dim">
            {e.text}
            {e.link && (
              <>
                {" "}
                <a
                  href={e.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
                >
                  tx
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Payments({
  payments,
  payTo,
  network,
  discovery,
  parent,
  log = [],
  bill = null,
}: {
  payments: Payment[];
  payTo?: string | null;
  network?: string | null;
  discovery?: string | null;
  parent?: string | null;
  log?: LogEntry[];
  bill?: Bill | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [everything, setEverything] = useState(false);

  if (!payments.length) return null;

  // When the terms came from ENS, the stage is shown as the name it was read
  // from. The point is not decoration: that name is where the price came from,
  // and the service cannot edit it.
  const resolved = discovery === "ens" && Boolean(parent);
  const label = (stage: string) => (resolved ? `${stage}.${parent}` : stage);

  const settled = payments.filter((p) => p.status === "paid").length;

  // Stages can settle on different chains, and two chains do not share a unit.
  // One total across both would be a number that means nothing, so it is only
  // shown when there is one chain to add up.
  const chains = new Set(payments.map((p) => p.network ?? "hedera:testnet"));
  const total =
    chains.size === 1
      ? payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
      : null;
  const unit = payments[0]?.label?.split(" ")[1] ?? "HBAR";
  const scale = [...chains][0]?.startsWith("eip155:") ? 1e6 : 1e8;

  // Open unless closed by hand; the stage being paid opens by itself.
  const isOpen = (p: Payment) => open[p.stage] ?? p.status === "paying";

  return (
    <div className="slot mt-4 p-4">
      {bill && (
        <div className="mb-3 border-l-2 border-sap pl-3 text-sm">
          <p className="text-dim">
            You paid your agent <span className="font-mono text-amber">{bill.total}</span>{" "}
            from your budget
            {bill.left ? <span className="text-faint"> · {bill.left} left</span> : null}
            {bill.explorer && (
              <>
                {" · "}
                <a
                  href={bill.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
                >
                  {bill.transaction?.slice(0, 12)}…
                </a>
              </>
            )}
          </p>
          <p className="label mt-1 !text-faint">
            {bill.items.map((b) => `${b.item} ${b.amount}`).join(" · ")}
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">
          the agent pays per stage — {settled} of {payments.length} settled
        </p>
        {resolved && (
          <p className="label !text-faint">
            prices resolved from <span className="text-amber">{parent}</span>,
            not from the service
          </p>
        )}
        {payTo && (
          <p className="label !text-faint">
            to <span className="font-mono">{payTo}</span>
            {network ? ` on ${network}` : ""}
          </p>
        )}
      </div>

      <ol className="space-y-px">
        {payments.map((p) => (
          <li key={p.stage} className="bg-bench-950">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [p.stage]: !isOpen(p) }))}
                aria-expanded={isOpen(p)}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
              >
                <span className="w-3 font-mono text-xs text-faint" aria-hidden>
                  {isOpen(p) ? "▾" : "▸"}
                </span>
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    p.status === "paid"
                      ? "bg-sap"
                      : p.status === "paying"
                        ? "animate-pulse bg-amber"
                        : "bg-bench-600"
                  }`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-sm text-ink ${resolved ? "w-52" : "w-16"}`}
                >
                  {label(p.stage)}
                </span>
                <span className="w-28 font-mono text-xs text-amber">{p.label}</span>
                <span
                  className={`w-20 text-xs ${
                    p.status === "paid" ? "text-sap" : "text-faint"
                  }`}
                >
                  {WORD[p.status]}
                </span>
                {p.seconds !== null && (
                  <span className="text-xs text-faint">{p.seconds}s</span>
                )}
              </button>
              {p.explorer && (
                <a
                  href={p.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto truncate font-mono text-xs text-faint underline decoration-bench-600 underline-offset-2 hover:text-dim"
                  title={p.transaction ?? undefined}
                >
                  {p.transaction}
                </a>
              )}
              {/* Paid through Circle Gateway: the receipt is Gateway's transfer
                  id, settled onchain later in a batch, so there is no
                  transaction of its own to link to yet. */}
              {!p.explorer && p.transaction && p.status === "paid" && (
                <span
                  className="ml-auto truncate font-mono text-xs text-sap"
                  title={p.transaction}
                >
                  via Circle Gateway · {p.transaction.slice(0, 8)}…
                </span>
              )}
            </div>
            {isOpen(p) && (
              <div className="border-t border-bench-800">
                <Lines entries={log.filter((e) => e.stage === p.stage)} />
              </div>
            )}
          </li>
        ))}
      </ol>

      {log.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setEverything((v) => !v)}
            aria-expanded={everything}
            className="font-mono text-xs text-faint hover:text-dim"
          >
            {everything ? "▾" : "▸"} every step, in order ({log.length})
          </button>
          {everything && (
            <div className="mt-1 bg-bench-950">
              <Lines
                entries={log.map((e) => ({
                  ...e,
                  text: `[${STEP[e.stage] ?? e.stage}] ${e.text}`,
                }))}
              />
            </div>
          )}
        </div>
      )}

      <p className="label mt-3 !text-faint">
        {total === null
          ? "Settled across two chains, so there is no single total."
          : `${(total / scale).toFixed(4)} ${unit} for this job.`}{" "}
        On Hedera the agent signs a partial transfer and the facilitator
        co-signs and covers the gas; on Arc it signs against its Circle Gateway
        balance and Circle settles the payments in batches. Either way it never
        needs gas.
      </p>
    </div>
  );
}

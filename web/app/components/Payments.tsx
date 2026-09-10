"use client";

// What the agent is spending, while it spends it.
//
// Every stage is listed from the start, with its price, before any of them is
// paid for — a price you are told afterwards is not a price. Then each one
// moves quoted → paying → paid as the agent works through them.
//
// The transaction id is the point of the whole exercise. Anyone can open it on
// HashScan and see the transfer, which is what separates a payment from a
// claim that one happened.

export type Payment = {
  stage: string;
  description?: string;
  amount: string;
  label: string;
  status: "quoted" | "paying" | "paid" | "unpaid";
  seconds: number | null;
  transaction: string | null;
  explorer: string | null;
};

const WORD: Record<Payment["status"], string> = {
  quoted: "quoted",
  paying: "paying",
  paid: "paid",
  unpaid: "not charged",
};

export default function Payments({
  payments,
  payTo,
  network,
  discovery,
  parent,
}: {
  payments: Payment[];
  payTo?: string | null;
  network?: string | null;
  discovery?: string | null;
  parent?: string | null;
}) {
  if (!payments.length) return null;

  // When the terms came from ENS, the stage is shown as the name it was read
  // from. The point is not decoration: that name is where the price came from,
  // and the service cannot edit it.
  const resolved = discovery === "ens" && Boolean(parent);
  const label = (stage: string) => (resolved ? `${stage}.${parent}` : stage);

  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const settled = payments.filter((p) => p.status === "paid").length;

  return (
    <div className="slot mt-4 p-4">
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
          <li
            key={p.stage}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-bench-950 px-3 py-2"
          >
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
            <span className="w-24 font-mono text-xs text-amber">{p.label}</span>
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
          </li>
        ))}
      </ol>

      <p className="label mt-3 !text-faint">
        {(total / 1e8).toFixed(4)} HBAR for the whole craft. The agent signs a
        partial transfer and the facilitator co-signs and covers the gas, so it
        needs an account but never needs gas.
      </p>
    </div>
  );
}

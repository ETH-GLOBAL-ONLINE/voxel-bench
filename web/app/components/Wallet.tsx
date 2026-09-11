"use client";

// Connecting a wallet here means one thing: saying which address owns what you
// make. It is not how anything gets paid for — the agent does that, out of its
// own account, and it does it whether or not anyone is connected.
//
// So there is no chain to switch to, no balance to hold and no gas to find. The
// wallet signs a message and nothing else, which is why an account created a
// minute ago with nothing in it can own a recipe.
//
// Deliberately no wallet library. `window.ethereum` and viem's own types are
// enough for connect-and-sign, and a connector framework would be more moving
// parts than the feature has.

import { useCallback, useEffect, useState } from "react";

type Ethereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Ethereum;
  }
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const eth = window.ethereum;
    setAvailable(Boolean(eth));
    if (!eth) return;

    // Nothing is asked of the wallet on load. Probing with eth_accounts to
    // remember a previous visit sets two installed extensions fighting over
    // who answers, and the loser throws inside its own injected script where
    // no catch of ours can reach it. Connecting is a click.
    const onAccountsChanged = (...args: never[]) => {
      const [accounts] = args as unknown as [string[]];
      setAddress(accounts?.[0] ?? null);
    };
    eth.on?.("accountsChanged", onAccountsChanged);
    return () => eth.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      // Some providers throw synchronously rather than rejecting, so the await
      // is inside the try rather than the call being handed a .catch.
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];
      setAddress(accounts?.[0] ?? null);
    } catch {
      // Declining is an answer, and a wallet that refuses to be asked is the
      // user's business rather than a failure of the page.
    }
  }, []);

  /** Signs the typed data the agent built. Returns null if the user declines. */
  const signTypedData = useCallback(
    async (typed: unknown) => {
      const eth = window.ethereum;
      if (!eth || !address) return null;
      try {
        return (await eth.request({
          method: "eth_signTypedData_v4",
          params: [address, JSON.stringify(typed)],
        })) as string;
      } catch {
        return null;
      }
    },
    [address],
  );

  return { address, available, connect, signTypedData };
}

export default function Wallet({
  address,
  available,
  onConnect,
}: {
  address: string | null;
  available: boolean;
  onConnect: () => void;
}) {
  if (address) {
    return (
      <span className="label !text-faint">
        · owning as <span className="font-mono text-amber">{short(address)}</span>
      </span>
    );
  }

  if (!available) {
    return (
      <span className="label !text-faint">
        · no wallet here — craft anyway, claim later
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      className="label !text-dim underline decoration-bench-600 underline-offset-2 hover:!text-ink"
    >
      · connect a wallet to own what you make
    </button>
  );
}

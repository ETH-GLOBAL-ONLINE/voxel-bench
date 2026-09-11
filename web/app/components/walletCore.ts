"use client";

// What every source of a wallet provides, and what they share.
//
// There are two sources. With a Privy app configured, a visitor signs in with
// an email or a Google account and gets a wallet made for them, or brings the
// one they already have. Without one, the page finds the extensions installed
// in the browser. Either way the rest of the page sees the same thing: an
// address, a way to connect, and a way to sign — which is all that owning a
// recipe takes.

import { createContext, useContext } from "react";

export type Ethereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type Announced = { info: WalletInfo; provider: Ethereum };

declare global {
  interface Window {
    ethereum?: Ethereum;
  }
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Announced>;
  }
}

export type WalletState = {
  /** Where the wallet comes from, which decides what the buttons say. */
  kind: "privy" | "injected";
  address: string | null;
  /** Extensions that announced themselves. Empty under Privy, which has its own list. */
  wallets: Announced[];
  /** Whether there is anything at all to connect to. */
  available: boolean;
  /** Connect to a named wallet, or to the only one there is. */
  connect: (wallet?: Announced) => Promise<void>;
  signTypedData: (typed: unknown) => Promise<string | null>;
};

export const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (!state) throw new Error("useWallet needs a WalletProvider above it");
  return state;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// What a wallet needs in order to add a chain it has never seen. Only the two
// the contracts live on: a payload naming any other chain is not one this page
// built.
export const CHAINS: Record<
  number,
  {
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  296: {
    chainName: "Hedera Testnet",
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    rpcUrls: ["https://testnet.hashio.io/api"],
    blockExplorerUrls: ["https://hashscan.io/testnet"],
  },
  5042002: {
    chainName: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc.io"],
    blockExplorerUrls: ["https://testnet.arcscan.app"],
  },
};

const REJECTED = 4001;
const UNKNOWN_CHAIN = 4902;

// MetaMask sometimes reports an unknown chain inside the error rather than on
// it, so both places are read.
function codeOf(err: unknown): number | undefined {
  const e = err as { code?: number; data?: { originalError?: { code?: number } } };
  return e?.data?.originalError?.code ?? e?.code;
}

/** Puts the wallet on `chainId`, adding the chain first if it has to. */
async function moveTo(provider: Ethereum, chainId: number) {
  const wanted = `0x${chainId.toString(16)}`;
  const active = (await provider.request({ method: "eth_chainId" })) as string;
  if (active?.toLowerCase() === wanted) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: wanted }],
    });
  } catch (err) {
    const known = CHAINS[chainId];
    if (codeOf(err) !== UNKNOWN_CHAIN || !known) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: wanted, ...known }],
    });
  }
}

/**
 * Signs the typed data the agent built, on the chain it names. A signature is
 * bound to the contract's chain and a wallet refuses to sign for any chain but
 * the one it is on, so the switch comes first; it costs nothing.
 *
 * Returns null if the visitor declines; throws on anything else, because a
 * button that silently does nothing hides the failure.
 */
export async function signOn(
  provider: Ethereum,
  address: string,
  typed: unknown,
): Promise<string | null> {
  try {
    const chainId = Number(
      (typed as { domain?: { chainId?: number | string } }).domain?.chainId,
    );
    if (chainId) await moveTo(provider, chainId);

    return (await provider.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typed)],
    })) as string;
  } catch (err) {
    if (codeOf(err) === REJECTED) return null;
    throw new Error(
      (err as { message?: string })?.message ?? "the wallet could not sign",
    );
  }
}

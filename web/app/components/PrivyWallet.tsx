"use client";

// Signing in with an email or a Google account, through Privy.
//
// The people this is for are building Roblox games, and most of them have never
// installed a wallet. Asking for one first is a filter the product does not
// need. Privy makes a wallet for anyone who signs in without one, and that
// wallet signs EIP-712 exactly as an extension does — RecipeBook checks the
// signature, not where it came from. Someone who already has a wallet can still
// bring it; it is one of the options in the same dialog.
//
// Nothing past this file changes. The claim, the agent and the contract are the
// same for every kind of wallet.

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useMemo, type ReactNode } from "react";
import { defineChain } from "viem";
import { WalletContext, signOn, type Ethereum } from "./walletCore";

// The two chains the contracts live on. The wallet has to be able to switch to
// either, because a claim is signed on whichever chain the recipe is recorded.
const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
});

const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: {
    default: { name: "HashScan", url: "https://hashscan.io/testnet" },
  },
});

export default function PrivyWalletProvider({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "#131110",
          accentColor: "#ffae3b",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: arc,
        supportedChains: [arc, hedera],
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}

/** Turns Privy's view of the visitor into the one the rest of the page reads. */
function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  // The wallet Privy made for this visitor if there is one, otherwise the one
  // they brought.
  const wallet = authenticated
    ? (wallets.find((w) => w.walletClientType === "privy") ?? wallets[0])
    : undefined;

  const connect = useCallback(async () => {
    if (ready) login();
  }, [ready, login]);

  const signTypedData = useCallback(
    async (typed: unknown) => {
      if (!wallet) return null;
      const provider = (await wallet.getEthereumProvider()) as unknown as Ethereum;
      return signOn(provider, wallet.address, typed);
    },
    [wallet],
  );

  const value = useMemo(
    () => ({
      kind: "privy" as const,
      address: wallet?.address ?? null,
      wallets: [],
      // Offered before Privy has finished loading: the dialog opens as soon as
      // it can, and telling someone there is no wallet would be untrue.
      available: true,
      connect,
      signTypedData,
    }),
    [wallet, connect, signTypedData],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

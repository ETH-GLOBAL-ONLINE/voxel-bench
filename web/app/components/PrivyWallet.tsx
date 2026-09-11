"use client";

// Signing in with an email, a Google or an X account, through Privy.
//
// The people this is for are building Roblox games, and most of them have never
// installed a wallet. Asking for one first is a filter the product does not
// need. Privy makes a wallet for anyone who signs in without one, and that
// wallet signs EIP-712 exactly as an extension does — RecipeBook checks the
// signature, not where it came from. Someone who already has a wallet can still
// bring it; it is one of the options in the same dialog.
//
// This file is loaded in the browser only (see Wallet.tsx). Privy works only in
// a browser anyway, and its dependencies — WalletConnect, Solana, Coinbase and
// more — are large enough that compiling them for the server as well ran the
// deployment's build out of memory. So this is an island: it renders nothing,
// and reports the visitor's wallet to the page, which renders on the server
// without it.

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defineChain } from "viem";
import { signOn, type Ethereum, type WalletState } from "./walletCore";

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

export default function PrivyIsland({
  appId,
  onChange,
}: {
  appId: string;
  onChange: (state: WalletState) => void;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
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
      <Bridge onChange={onChange} />
    </PrivyProvider>
  );
}

/** Turns Privy's view of the visitor into the one the rest of the page reads. */
function Bridge({ onChange }: { onChange: (state: WalletState) => void }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  // The wallet Privy made for this visitor if there is one, otherwise the one
  // they brought.
  const wallet = authenticated
    ? (wallets.find((w) => w.walletClientType === "privy") ?? wallets[0])
    : undefined;

  // Privy keeps a session of its own, apart from any wallet. Someone who signed
  // in with MetaMask and then locked it is still signed in to Privy with no
  // wallet to sign with — and login() is silently ignored while a session
  // exists, so Sign in did nothing. A session without a wallet is closed first,
  // and Sign in always opens the whole dialog.
  //
  // Not in the same breath, though: straight after logout() Privy still counts
  // the session as open and drops the login, which made Sign in take two
  // clicks. So the login waits until the session is seen closed.
  const [loginAfterLogout, setLoginAfterLogout] = useState(false);

  useEffect(() => {
    if (loginAfterLogout && ready && !authenticated) {
      setLoginAfterLogout(false);
      login();
    }
  }, [loginAfterLogout, ready, authenticated, login]);

  const connect = useCallback(async () => {
    if (!ready) return;
    if (!authenticated) {
      login();
      return;
    }
    setLoginAfterLogout(true);
    await logout();
  }, [ready, authenticated, login, logout]);

  const disconnect = useCallback(async () => {
    await logout();
  }, [logout]);

  const signTypedData = useCallback(
    async (typed: unknown) => {
      if (!wallet) return null;
      const provider = (await wallet.getEthereumProvider()) as unknown as Ethereum;
      return signOn(provider, wallet.address, typed);
    },
    [wallet],
  );

  const state = useMemo<WalletState>(
    () => ({
      kind: "privy",
      address: wallet?.address ?? null,
      wallets: [],
      available: true,
      connect,
      disconnect,
      signTypedData,
    }),
    [wallet, connect, disconnect, signTypedData],
  );

  useEffect(() => {
    onChange(state);
  }, [state, onChange]);

  return null;
}

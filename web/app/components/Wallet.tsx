"use client";

// Connecting a wallet here means one thing: saying which address owns what you
// make. It is not how anything gets paid for — the agent does that, out of its
// own account, and it does it whether or not anyone is connected.
//
// So there is no balance to hold and no gas to find. The wallet signs a message
// and nothing else, which is why an account created a minute ago with nothing in
// it can own a recipe. It does have to be on the right chain: a signature is
// bound to the contract's chain, and a wallet refuses to sign for any chain but
// the one it is on. Switching costs nothing, so the page asks for it first.
//
// Where the wallet comes from depends on configuration. With a Privy app set in
// NEXT_PUBLIC_PRIVY_APP_ID, a visitor signs in with an email or a Google account
// and gets a wallet made for them — see PrivyWallet.tsx. Without one, as on a
// fresh clone, the page finds the browser's extensions itself, below.
//
// Extensions are found through EIP-6963 rather than through `window.ethereum`.
// That property is one slot and every extension wants it, so on a machine with
// two installed the occupant is whoever loaded last, and asking it for an
// account can land inside a chooser belonging to a wallet the visitor never
// meant to use — which throws inside its own injected script, where no catch of
// ours can reach it. Under EIP-6963 each extension announces itself and the
// choice is ours to offer rather than theirs to seize.
//
// The connection lives in a context because the header offers it and the bench
// uses it, and two buttons that disagree about whether you are connected are
// worse than one button in the wrong place.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  WalletContext,
  short,
  signOn,
  useWallet,
  type Announced,
  type Ethereum,
  type WalletState,
} from "./walletCore";

export { short, useWallet };

// Inlined at build time, so a deployment without it simply keeps extensions.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// Privy, in the browser only. It cannot work on a server, and compiling its
// dependencies for the server as well as for the browser ran the deployment's
// build out of memory. The page still renders on the server in full; Privy
// arrives a moment later and reports who is signed in.
const PrivyIsland = dynamic(() => import("./PrivyWallet"), { ssr: false });

// What the page shows until Privy has loaded: nobody signed in, as on a first
// visit. Sign in is on screen from the start but does nothing until the island
// arrives, which takes a fraction of a second after the page appears.
const SIGNED_OUT: WalletState = {
  kind: "privy",
  address: null,
  wallets: [],
  available: true,
  connect: async () => {},
  disconnect: async () => {},
  signTypedData: async () => null,
};

function PrivyWalletProvider({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<WalletState>(SIGNED_OUT);
  return (
    <WalletContext.Provider value={state}>
      {children}
      <PrivyIsland appId={appId} onChange={setState} />
    </WalletContext.Provider>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return PRIVY_APP_ID ? (
    <PrivyWalletProvider appId={PRIVY_APP_ID}>{children}</PrivyWalletProvider>
  ) : (
    <InjectedWalletProvider>{children}</InjectedWalletProvider>
  );
}

function InjectedWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Announced[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false);
  const connected = useRef<Ethereum | null>(null);

  // One stable reference, so the same function that subscribes unsubscribes.
  const onAccounts = useCallback((...args: never[]) => {
    const [accounts] = args as unknown as [string[]];
    setAddress(accounts?.[0] ?? null);
  }, []);

  useEffect(() => {
    const onAnnounce = (event: CustomEvent<Announced>) => {
      const found = event.detail;
      setWallets((known) =>
        known.some((w) => w.info.uuid === found.info.uuid)
          ? known
          : [...known, found],
      );
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    // Asking every extension to introduce itself. This is an event, not a
    // wallet call: nothing pops up and no account is requested.
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // An extension too old to announce itself is still a wallet, and its owner
    // should not be told there is none.
    setLegacy(Boolean(window.ethereum));

    return () =>
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const connect = useCallback(
    async (wallet?: Announced) => {
      const provider =
        wallet?.provider ??
        (wallets.length === 1 ? wallets[0].provider : undefined) ??
        (wallets.length === 0 ? window.ethereum : undefined);
      // More than one and none named: the page asks before anything opens.
      if (!provider) return;

      try {
        // Some providers throw synchronously rather than rejecting, so the
        // await is inside the try rather than the call handed a .catch.
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!accounts?.length) return;

        connected.current?.removeListener?.("accountsChanged", onAccounts);
        connected.current = provider;
        provider.on?.("accountsChanged", onAccounts);
        setAddress(accounts[0]);
      } catch {
        // Declining is an answer, and a wallet that refuses to be asked is the
        // visitor's business rather than a failure of the page.
      }
    },
    [wallets, onAccounts],
  );

  const signTypedData = useCallback(
    async (typed: unknown) => {
      const provider = connected.current;
      if (!provider || !address) return null;
      return signOn(provider, address, typed);
    },
    [address],
  );

  // A page cannot disconnect an extension. Forgetting it here is what is
  // possible, and connecting again asks the extension afresh.
  const disconnect = useCallback(async () => {
    connected.current?.removeListener?.("accountsChanged", onAccounts);
    connected.current = null;
    setAddress(null);
  }, [onAccounts]);

  const value = useMemo(
    () => ({
      kind: "injected" as const,
      address,
      wallets,
      available: wallets.length > 0 || legacy,
      connect,
      disconnect,
      signTypedData,
    }),
    [address, wallets, legacy, connect, disconnect, signTypedData],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/** The list offered when more than one extension answered. */
function Choices({
  wallets,
  onPick,
  align = "right-0",
}: {
  wallets: Announced[];
  onPick: (wallet: Announced) => void;
  align?: string;
}) {
  return (
    <ul
      className={`absolute ${align} z-20 mt-1 min-w-44 border border-bench-600 bg-bench-950 p-1`}
    >
      {wallets.map((wallet) => (
        <li key={wallet.info.uuid}>
          <button
            type="button"
            onClick={() => onPick(wallet)}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-dim hover:bg-bench-900 hover:text-ink"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wallet.info.icon} alt="" className="h-4 w-4" />
            {wallet.info.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The one in the header, where people look for it first. */
export function HeaderWallet() {
  const { kind, address, wallets, available, connect, disconnect } = useWallet();
  const [choosing, setChoosing] = useState(false);
  const frame = "border px-3.5 py-1.5 text-xs";

  if (address) {
    return (
      <span className="ml-auto flex items-center gap-3 md:ml-0">
        <span className={`${frame} border-amber/50 font-mono text-amber`}>
          {short(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="text-xs text-faint transition-colors hover:text-ink"
        >
          {kind === "privy" ? "Sign out" : "Disconnect"}
        </button>
      </span>
    );
  }

  // Only extensions can be missing. Rendered before they announce themselves,
  // and on a browser with none — and neither is broken: the bench works without
  // a wallet and what you make waits for you to claim it.
  if (!available) {
    return (
      <span
        className={`ml-auto md:ml-0 ${frame} border-bench-600 text-faint`}
        title="Craft without one — what you make waits to be claimed."
      >
        No wallet detected
      </span>
    );
  }

  const label =
    kind === "privy"
      ? "Sign in"
      : `Connect wallet${wallets.length > 1 ? ` · ${wallets.length}` : ""}`;

  return (
    <div className="relative ml-auto md:ml-0">
      <button
        type="button"
        onClick={() => (wallets.length > 1 ? setChoosing((c) => !c) : connect())}
        className={`${frame} border-bench-600 text-dim transition-colors hover:border-amber/60 hover:text-ink`}
      >
        {label}
      </button>
      {choosing && (
        <Choices
          wallets={wallets}
          onPick={(wallet) => {
            setChoosing(false);
            connect(wallet);
          }}
        />
      )}
    </div>
  );
}

/** The one beside the prompt, which says what connecting is for. */
export default function Wallet() {
  const { kind, address, wallets, available, connect } = useWallet();
  const [choosing, setChoosing] = useState(false);

  if (address) {
    return (
      <span className="label !text-faint">
        · owning as{" "}
        <span className="font-mono text-amber">{short(address)}</span>
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
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => (wallets.length > 1 ? setChoosing((c) => !c) : connect())}
        className="label !text-dim underline decoration-bench-600 underline-offset-2 hover:!text-ink"
      >
        {kind === "privy"
          ? "· sign in to own what you make"
          : "· connect a wallet to own what you make"}
      </button>
      {choosing && (
        <Choices
          wallets={wallets}
          onPick={(wallet) => {
            setChoosing(false);
            connect(wallet);
          }}
          align="left-0"
        />
      )}
    </span>
  );
}

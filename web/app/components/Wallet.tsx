"use client";

// Connecting a wallet here means one thing: saying which address owns what you
// make. It is not how anything gets paid for — the agent does that, out of its
// own account, and it does it whether or not anyone is connected.
//
// So there is no chain to switch to, no balance to hold and no gas to find. The
// wallet signs a message and nothing else, which is why an account created a
// minute ago with nothing in it can own a recipe.
//
// Wallets are found through EIP-6963 rather than through `window.ethereum`.
// That property is one slot and every extension wants it, so on a machine with
// two installed the occupant is whoever loaded last, and asking it for an
// account can land inside a chooser belonging to a wallet the visitor never
// meant to use — which throws inside its own injected script, where no catch of
// ours can reach it. Under EIP-6963 each extension announces itself and the
// choice is ours to offer rather than theirs to seize.
//
// The connection lives in a context because the header offers it and the bench
// uses it, and two Connect buttons that disagree about whether you are
// connected are worse than one button in the wrong place.
//
// Deliberately no wallet library. Discovery is an event listener and signing is
// one request, and a connector framework would be more moving parts than the
// feature has.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Ethereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
type Announced = { info: WalletInfo; provider: Ethereum };

declare global {
  interface Window {
    ethereum?: Ethereum;
  }
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Announced>;
  }
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type WalletState = {
  address: string | null;
  /** Everything that announced itself, in the order it did. */
  wallets: Announced[];
  /** Whether there is anything at all to connect to. */
  available: boolean;
  /** Connect to a named wallet, or to the only one there is. */
  connect: (wallet?: Announced) => Promise<void>;
  signTypedData: (typed: unknown) => Promise<string | null>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
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

  /** Signs the typed data the agent built. Returns null if the user declines. */
  const signTypedData = useCallback(
    async (typed: unknown) => {
      const provider = connected.current;
      if (!provider || !address) return null;
      try {
        return (await provider.request({
          method: "eth_signTypedData_v4",
          params: [address, JSON.stringify(typed)],
        })) as string;
      } catch {
        return null;
      }
    },
    [address],
  );

  const value = useMemo(
    () => ({
      address,
      wallets,
      available: wallets.length > 0 || legacy,
      connect,
      signTypedData,
    }),
    [address, wallets, legacy, connect, signTypedData],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const state = useContext(WalletContext);
  if (!state) throw new Error("useWallet needs a WalletProvider above it");
  return state;
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
  const { address, wallets, available, connect } = useWallet();
  const [choosing, setChoosing] = useState(false);
  const frame = "border px-3.5 py-1.5 text-xs";

  if (address) {
    return (
      <span
        className={`ml-auto md:ml-0 ${frame} border-amber/50 font-mono text-amber`}
      >
        {short(address)}
      </span>
    );
  }

  // Rendered before the announcements arrive, and on a browser with no wallet
  // at all. Both say the same thing, because neither is broken: the bench works
  // without a wallet and what you make waits for you to claim it.
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

  return (
    <div className="relative ml-auto md:ml-0">
      <button
        type="button"
        onClick={() => (wallets.length > 1 ? setChoosing((c) => !c) : connect())}
        className={`${frame} border-bench-600 text-dim transition-colors hover:border-amber/60 hover:text-ink`}
      >
        Connect wallet{wallets.length > 1 ? ` · ${wallets.length}` : ""}
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
  const { address, wallets, available, connect } = useWallet();
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
        · connect a wallet to own what you make
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

"use client";

import { useEffect, useState } from "react";

export type RobloxAccount = { apiKey: string; userId: string };

const STORE = "voxel-bench.roblox";

/** The key lives in the browser and nowhere else.
 *
 * It is sent with each publish and used for that one upload. We never write it
 * down, which is the point: a service that holds other people's Roblox keys is
 * worth attacking, and one that does not is not. localStorage is per-browser,
 * so this is a connection you make once per machine rather than an account.
 */
export function loadAccount(): RobloxAccount | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.apiKey === "string" && typeof parsed?.userId === "string") {
      return parsed;
    }
  } catch {
    // private windows and blocked storage both land here
  }
  return null;
}

export default function RobloxConnect({
  account,
  onChange,
}: {
  account: RobloxAccount | null;
  onChange: (a: RobloxAccount | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) setOpen(false);
  }, [account]);

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    const id = userId.trim();
    if (key.length < 20) return setError("That does not look like an API key.");
    if (!/^\d{3,20}$/.test(id)) {
      return setError("The user id is the number in your profile URL.");
    }
    const next = { apiKey: key, userId: id };
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      setError("This browser is blocking storage, so the key cannot be kept.");
      return;
    }
    setApiKey("");
    setUserId("");
    setError(null);
    onChange(next);
  }

  function disconnect() {
    try {
      localStorage.removeItem(STORE);
    } catch {
      // nothing to do; clearing the state below is what matters
    }
    onChange(null);
  }

  if (account) {
    return (
      <div className="slot flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2.5 text-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sap" />
          Roblox account{" "}
          <code className="font-mono text-amber">{account.userId}</code>
          <span className="text-faint">— publishing goes to your inventory</span>
        </p>
        <button
          type="button"
          onClick={disconnect}
          className="text-xs text-faint hover:text-dim"
        >
          disconnect
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="slot flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-dim">
          No Roblox account connected. You can craft, but publishing needs one.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-bench-600 px-4 py-2 text-sm text-ink transition-colors hover:border-amber/60"
        >
          Connect Roblox
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={connect} className="slot p-5">
      <p className="label mb-4">Connect your Roblox account</p>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="label">Open Cloud API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="paste it here"
            className="mt-1.5 w-full border border-bench-700 bg-bench-950 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-amber/60"
          />
        </label>
        <label className="block">
          <span className="label">Your user id</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            inputMode="numeric"
            placeholder="1606046734"
            className="mt-1.5 w-full border border-bench-700 bg-bench-950 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-amber/60"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-ember">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="bg-amber px-5 py-2 text-sm font-semibold text-bench-950 transition-opacity hover:opacity-90"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-faint hover:text-dim"
        >
          cancel
        </button>
      </div>

      <div className="mt-5 space-y-2 border-t border-bench-700 pt-4 text-sm text-faint">
        <p>
          The key stays in this browser. It is sent with each publish and used
          for that one upload — we never store it, because a service holding
          other people&rsquo;s Roblox keys is worth attacking and one that does
          not is not.
        </p>
        <p>
          Make one at{" "}
          <a
            href="https://create.roblox.com/dashboard/credentials"
            target="_blank"
            rel="noreferrer"
            className="text-dim underline decoration-bench-600 underline-offset-2 hover:text-ink"
          >
            create.roblox.com/dashboard/credentials
          </a>{" "}
          with the <code className="font-mono">assets</code> system, read and
          write, and your account as the creator.
        </p>
        <p>
          <span className="text-ember">Do not leave the IP allowlist empty.</span>{" "}
          An empty list rejects everything with a 403 that never mentions the IP.
          Use <code className="font-mono">0.0.0.0/0</code> while you are testing.
        </p>
        <p>
          Your user id is the number in your profile URL:
          roblox.com/users/<span className="text-dim">1606046734</span>/profile
        </p>
      </div>
    </form>
  );
}

// A visitor's backpack: the recipes they own, and what each one is.
//
// Ownership comes from the chain and from nothing else. RecipePublished is
// indexed by author, so each chain answers for itself, with the bench switched
// off as well as on.
//
// What a recipe is — its name, its preview — comes from the catalog, which
// checks every row against the id it is filed under. A recipe the catalog does
// not have is still listed, by its id.

import { isAddress } from "viem";
import { bench } from "../bench";
import { readCatalog, readCollected } from "../catalog";
import { LEDGERS, ownedBy, type LedgerName } from "../chain";

export const dynamic = "force-dynamic";

type Unclaimed = {
  id: string;
  name: string | null;
  chain: string | null;
  at: string;
  ingredients: number | null;
  preview: string | null;
};

// What they crafted and have not claimed yet. Only the agent knows this — it
// is the one that saw who paid for the craft — and it says so only by id and
// name, never the recipe itself. With the bench off there is nothing to ask.
async function readUnclaimed(address: string): Promise<Unclaimed[]> {
  const target = bench();
  if (!target?.paid) return [];
  try {
    const res = await fetch(new URL(`/unclaimed?address=${address}`, target.base), {
      cache: "no-store",
      // The agent checks each one against the chain before answering.
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Omit<Unclaimed, "preview">[] };
    return (data.items ?? []).map((u) => ({
      ...u,
      // The render sits beside the crafter's files, which the site serves.
      preview: u.name ? `/api/out/${u.name}_preview.png` : null,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return Response.json({ error: "bad address" }, { status: 400 });
  }

  const names = Object.keys(LEDGERS) as LedgerName[];
  const settled = await Promise.allSettled(
    names.map((name) => ownedBy(name, address as `0x${string}`)),
  );
  const owned = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

  // A chain that could not be read is named, not left out. An owner told their
  // backpack is empty, when the node was only busy, has been told something
  // false about their own work.
  const unreadable = names
    .filter((_, i) => settled[i].status === "rejected")
    .map((name) => LEDGERS[name].chain.name);

  // What they got from the marketplace, as opposed to what they made. The
  // payment for each is on the chain; who it was for is noted by the agent.
  const [got, unclaimed] = await Promise.all([readCollected(address), readUnclaimed(address)]);

  const catalog = await readCatalog([
    ...new Set([...owned.map((r) => r.id), ...got.map((c) => c.id)]),
  ]);

  const items = owned.map((r) => ({
    ...r,
    name: catalog.get(r.id)?.name ?? null,
    preview: catalog.get(r.id)?.preview ?? null,
    ingredients: catalog.get(r.id)?.ingredients ?? null,
  }));

  const collected = got.map((c) => ({
    ...c,
    name: catalog.get(c.id)?.name ?? null,
    preview: catalog.get(c.id)?.preview ?? null,
  }));

  return Response.json({ address, items, collected, unclaimed, unreadable });
}

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
import { readCatalog, readCollected } from "../catalog";
import { LEDGERS, ownedBy, type LedgerName } from "../chain";

export const dynamic = "force-dynamic";

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
  const got = await readCollected(address);

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

  return Response.json({ address, items, collected, unreadable });
}

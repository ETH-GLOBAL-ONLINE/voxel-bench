// The marketplace: every recipe on the chains, what it is, and who made it.
//
// Which recipes exist and who owns them is read from RecipeBook on each chain.
// Names and previews come from the catalog, checked against each id. A chain
// that cannot be read is named in the answer rather than shown as an empty
// shelf.

import { isAddress } from "viem";
import { readCatalog, readCollected } from "../catalog";
import { LEDGERS, publishedOn, type LedgerName } from "../chain";

export const dynamic = "force-dynamic";

// The platform publishes its own recipes, like any author, and is paid like
// one. Marked so the shelf can tell its stock from what people made.
const PLATFORM = "0xfe3caad68785d76b70cec542518d2a003ea90034";

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("address") ?? "";
  const names = Object.keys(LEDGERS) as LedgerName[];

  const [settled, got] = await Promise.all([
    Promise.allSettled(names.map((name) => publishedOn(name, 200))),
    // What the visitor already got, so the shelf does not offer it again.
    isAddress(asked) ? readCollected(asked) : Promise.resolve([]),
  ]);
  const collected = new Set(got.map((c) => c.id.toLowerCase()));

  const unreadable = names
    .filter((_, i) => settled[i].status === "rejected")
    .map((name) => LEDGERS[name].chain.name);

  const rows = settled.flatMap((s) =>
    s.status === "fulfilled"
      ? s.value.recipes.map((r) => ({
          ...r,
          id: r.id.toLowerCase(),
          chain: s.value.chain,
          explorer: s.value.explorer,
        }))
      : [],
  );

  const catalog = await readCatalog([...new Set(rows.map((r) => r.id))]);

  // Only what can be got. An id with no recipe behind it in the catalog cannot
  // be crafted — the contract test that proved the split published the hash of
  // a word, not of a recipe — so it stays on the chain and off the shelf.
  const items = rows
    .filter((r) => catalog.has(r.id))
    .map((r) => ({
      ...r,
      platform: r.author.toLowerCase() === PLATFORM,
      collected: collected.has(r.id),
      name: catalog.get(r.id)?.name ?? null,
      preview: catalog.get(r.id)?.preview ?? null,
      ingredients: catalog.get(r.id)?.ingredients ?? null,
    }));

  return Response.json({ items, unreadable });
}

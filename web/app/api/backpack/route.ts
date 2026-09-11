// A visitor's backpack: the recipes they own, and what each one is.
//
// Ownership comes from the chain and from nothing else. RecipePublished is
// indexed by author, so each chain answers for itself, with the bench switched
// off as well as on.
//
// What a recipe is — its name, its preview — comes from the catalog, filed
// under the recipe's id. A row whose content does not hash to that id is
// ignored, so the catalog can be missing a recipe but cannot put the wrong name
// on someone's work. A recipe it does not have is still listed, by its id.

import { isAddress, keccak256, toHex } from "viem";
import { LEDGERS, ownedBy, type LedgerName } from "../chain";

export const dynamic = "force-dynamic";

// The agent's hash, reproduced: keys sorted at every depth, no whitespace. Two
// serialisations that disagree by one space are two different recipes.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type Filed = { name: string; preview: string | null; ingredients: number | null };

async function readCatalog(ids: string[]): Promise<Map<string, Filed>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const found = new Map<string, Filed>();
  if (!url || !key || !ids.length) return found;

  try {
    const res = await fetch(
      `${url}/rest/v1/recipes?select=id,name,recipe,preview_path&id=in.(${ids.join(",")})`,
      { headers: { apikey: key }, cache: "no-store" },
    );
    if (!res.ok) return found;

    const rows = (await res.json()) as {
      id: string;
      name: string;
      recipe: { ingredients?: unknown[] };
      preview_path: string | null;
    }[];

    for (const row of rows) {
      // Checked, not trusted.
      if (keccak256(toHex(canonical(row.recipe))).toLowerCase() !== row.id) continue;
      found.set(row.id, {
        name: row.name,
        preview: row.preview_path
          ? `${url}/storage/v1/object/public/previews/${row.preview_path}`
          : null,
        ingredients: Array.isArray(row.recipe?.ingredients)
          ? row.recipe.ingredients.length
          : null,
      });
    }
  } catch {
    // Without the catalog the backpack still lists what the chain says.
  }
  return found;
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

  const catalog = await readCatalog([...new Set(owned.map((r) => r.id))]);

  const items = owned.map((r) => ({
    ...r,
    name: catalog.get(r.id)?.name ?? null,
    preview: catalog.get(r.id)?.preview ?? null,
    ingredients: catalog.get(r.id)?.ingredients ?? null,
  }));

  return Response.json({ address, items, unreadable });
}

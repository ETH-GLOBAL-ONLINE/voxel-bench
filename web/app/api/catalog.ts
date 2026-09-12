// The recipe catalog, as the site reads it.
//
// Names and previews live in Supabase, filed under each recipe's id. The id is
// the hash of the recipe's content, so every row is hashed again here and
// compared with the id it is filed under; a row that does not match is dropped.
// The catalog can be missing a recipe. It cannot put the wrong name on one.

import { keccak256, toHex } from "viem";

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

export type Filed = {
  name: string;
  preview: string | null;
  ingredients: number | null;
};

/** What the catalog says about each of these ids, checked against them. */
export async function readCatalog(ids: string[]): Promise<Map<string, Filed>> {
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
    // Without the catalog, a recipe is still listed by its id.
  }
  return found;
}

export type Collected = {
  id: string;
  chain: string | null;
  transaction: string | null;
  at: string;
};

/**
 * What an address got from the marketplace, newest first. Written only by the
 * agent, which is the one paying today; empty when there is nothing, or when
 * the table is not there yet.
 */
export async function readCollected(collector: string): Promise<Collected[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(
      `${url}/rest/v1/collections?select=recipe_id,chain,transaction,created_at` +
        `&collector=eq.${collector.toLowerCase()}&order=created_at.desc&limit=200`,
      { headers: { apikey: key }, cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as {
      recipe_id: string;
      chain: string | null;
      transaction: string | null;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.recipe_id,
      chain: r.chain,
      transaction: r.transaction,
      at: r.created_at,
    }));
  } catch {
    return [];
  }
}

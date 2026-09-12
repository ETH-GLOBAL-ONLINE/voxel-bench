// The recipe catalog, written by the agent.
//
// What a recipe is — its name, its content, a preview — is kept in Supabase, so
// a backpack can show it by name while the machine that crafted it is asleep.
// Who owns it is not kept here: RecipeBook says that, and the table has no
// column that could disagree. A row is filed under the recipe's id, the hash of
// its content, so anyone can check a row against the id it sits under.
//
// Optional by design. Without SUPABASE_SERVICE_ROLE_KEY the bench crafts and
// settles exactly as before, and the catalog simply does not grow.
import { readFile } from "node:fs/promises";
import { recipeId } from "./recipes.mjs";

const base = () => process.env.SUPABASE_URL;
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const catalogEnabled = () => Boolean(base() && secret());

// Supabase's newer secret keys (sb_secret_…) are not JWTs and belong in the
// apikey header alone; an Authorization header carrying one is refused. The
// older service_role key is a JWT and is sent both ways.
function headers(extra = {}) {
  const key = secret();
  return key.startsWith("sb_")
    ? { apikey: key, ...extra }
    : { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/**
 * File a recipe under its id, with its preview if there is one. Never throws:
 * a catalog that is down must not stop a craft that has already been paid for.
 */
export async function saveRecipe({ id, recipe, preview }) {
  if (!catalogEnabled()) return { saved: false, skipped: "no catalog configured" };

  let previewPath = null;
  if (preview) {
    try {
      const path = `${id}.png`;
      const res = await fetch(`${base()}/storage/v1/object/previews/${path}`, {
        method: "POST",
        headers: headers({ "Content-Type": "image/png", "x-upsert": "true" }),
        body: await readFile(preview),
      });
      if (res.ok) previewPath = path;
    } catch {
      // A recipe without a picture is still a recipe.
    }
  }

  try {
    const res = await fetch(`${base()}/rest/v1/recipes?on_conflict=id`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        id,
        name: recipe?.name ?? "untitled",
        recipe,
        ...(previewPath ? { preview_path: previewPath } : {}),
      }),
    });
    if (!res.ok) {
      return { saved: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    }
    return { saved: true, preview: previewPath };
  } catch (err) {
    return { saved: false, error: err?.message ?? String(err) };
  }
}

/**
 * A recipe's content, read back from the catalog and checked against its id.
 * Null when the catalog does not have it or has something else under that id.
 */
export async function fetchRecipe(id) {
  if (!catalogEnabled()) return null;
  try {
    const res = await fetch(`${base()}/rest/v1/recipes?select=recipe&id=eq.${id}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const [row] = await res.json();
    if (!row?.recipe) return null;
    return recipeId(row.recipe).toLowerCase() === id.toLowerCase() ? row.recipe : null;
  } catch {
    return null;
  }
}

/**
 * Note that `collector` got a copy of a recipe from the marketplace. The payment
 * to its author is on the chain already; this records who it was for, which the
 * chain cannot while the agent is the one paying. Never throws.
 */
export async function saveCollection({ collector, recipeId: id, chain, transaction }) {
  if (!catalogEnabled() || !collector) return { saved: false, skipped: "nobody to note" };
  try {
    const res = await fetch(`${base()}/rest/v1/collections`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({
        collector: collector.toLowerCase(),
        recipe_id: id.toLowerCase(),
        chain,
        transaction,
      }),
    });
    if (!res.ok) {
      return { saved: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    }
    return { saved: true };
  } catch (err) {
    return { saved: false, error: err?.message ?? String(err) };
  }
}

/** Whether `collector` already got this recipe from the marketplace. */
export async function hasCollected(collector, id) {
  if (!catalogEnabled() || !collector) return false;
  try {
    const res = await fetch(
      `${base()}/rest/v1/collections?select=id&collector=eq.${collector.toLowerCase()}` +
        `&recipe_id=eq.${id.toLowerCase()}&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return false;
    return (await res.json()).length > 0;
  } catch {
    return false;
  }
}

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

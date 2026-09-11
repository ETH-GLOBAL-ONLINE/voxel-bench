// File every recipe the bench has crafted into the catalog.
//
// The agent files new recipes as it crafts them. This is for the ones made
// before there was a catalog: it reads out/, computes each recipe's id from its
// content — the same id RecipeBook uses — and files it with its preview.
//
// A file whose recipe was later re-crafted under the same name holds the newer
// content, and files under the newer id. The older id simply stays out of the
// catalog: nothing here is matched by name, because a name is not an identity.
//
//     node services/agent/backfill-catalog.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../env.mjs";
import { catalogEnabled, saveRecipe } from "./catalog.mjs";
import { recipeId } from "./recipes.mjs";

loadEnv();

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");

if (!catalogEnabled()) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env");
  process.exit(1);
}

const files = readdirSync(OUT).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".report.json"),
);

let saved = 0;
let pictured = 0;
const failed = [];

for (const file of files) {
  let recipe;
  try {
    recipe = JSON.parse(readFileSync(join(OUT, file), "utf8"));
  } catch {
    failed.push(`${file}: not JSON`);
    continue;
  }
  if (!Array.isArray(recipe?.ingredients)) continue; // not a recipe

  const id = recipeId(recipe);
  const stem = file.replace(/\.json$/, "");
  const preview = join(OUT, `${stem}_preview.png`);

  const result = await saveRecipe({
    id,
    recipe,
    preview: existsSync(preview) ? preview : null,
  });

  if (result.saved) {
    saved += 1;
    if (result.preview) pictured += 1;
    console.log(`filed  ${stem.padEnd(34)} ${id.slice(0, 12)}…${result.preview ? "  + preview" : ""}`);
  } else {
    failed.push(`${file}: ${result.error ?? result.skipped}`);
  }
}

console.log(`\n${saved} recipes filed, ${pictured} with a preview`);
for (const line of failed) console.log(`not filed  ${line}`);

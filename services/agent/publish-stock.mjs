// Publish the platform's own recipes, so the marketplace has stock.
//
// The platform is an author like any other: its recipes are published under its
// address, and a craft of one pays the author's share to it. Publishing them is
// also what protects them. A recipe nobody owns can be claimed by whoever sees
// its id first (SR-01 in docs/CONTRACT_AUDIT.md), and a catalog makes ids easy
// to see. Owned, they cannot be taken.
//
// Nothing is published unless it is listed. The list is keep.txt in the review
// folder: one preview file name per line, as they appear in
// out/marketplace-review/ — lib__<name>.png for the recipe library,
// dev__<name>.png for recipes crafted while the bench was being built.
//
//     node services/agent/publish-stock.mjs             # what would happen
//     node services/agent/publish-stock.mjs --publish   # do it
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../env.mjs";
import { catalogEnabled, saveRecipe } from "./catalog.mjs";
import { ledgerFor, lookup, recipeId } from "./recipes.mjs";

loadEnv();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "out");
const LIBRARY = join(ROOT, "bench", "recipes");
const REVIEW = join(OUT, "marketplace-review");
const publishing = process.argv.includes("--publish");

const ledger = ledgerFor();
const key = process.env.RECIPE_BOOK_KEY ?? process.env.HEDERA_AGENT_PRIVATE_KEY;
if (!key) {
  console.error("HEDERA_AGENT_PRIVATE_KEY is required");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const publicClient = createPublicClient({ chain: ledger.chain, transport: http() });
const wallet = createWalletClient({ account, chain: ledger.chain, transport: http() });
const abi = parseAbi(["function publish(bytes32 recipeId)"]);

// The public node limits its rate; a refusal for that is waited out.
async function patiently(ask, attempts = 5) {
  for (let i = 0; ; i++) {
    try {
      return await ask();
    } catch (err) {
      const said = `${err?.shortMessage ?? ""} ${err?.details ?? ""} ${err?.message ?? ""}`;
      if (i + 1 >= attempts || !/rate limit|exceeds defined limit|429/i.test(said)) throw err;
      await new Promise((wait) => setTimeout(wait, 1000 * 2 ** i));
    }
  }
}

function libraryByName() {
  const found = new Map();
  for (const file of readdirSync(LIBRARY).filter((f) => f.endsWith(".json"))) {
    try {
      const recipe = JSON.parse(readFileSync(join(LIBRARY, file), "utf8"));
      if (recipe?.name) found.set(recipe.name, join(LIBRARY, file));
    } catch {
      // not a recipe
    }
  }
  return found;
}

const library = libraryByName();

function sourceOf(entry) {
  const match = entry.match(/^(lib|dev)__(.+)\.png$/);
  if (!match) return null;
  const [, kind, name] = match;
  if (kind === "dev") {
    return { recipe: join(OUT, `${name}.json`), preview: join(OUT, `${name}_preview.png`) };
  }
  const file = library.get(name);
  return file ? { recipe: file, preview: join(OUT, "library", `${name}_preview.png`) } : null;
}

const keepFile = join(REVIEW, "keep.txt");
if (!existsSync(keepFile)) {
  console.error(`List what to publish in ${keepFile}, one file name per line.`);
  process.exit(1);
}
const keep = readFileSync(keepFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

console.log(
  `${publishing ? "Publishing" : "Would publish"} ${keep.length} recipes on ` +
    `${ledger.chain.name} as ${account.address}\n`,
);

let published = 0;
const skipped = [];
// The library and the bench's own crafts overlap: the same content under two
// file names is one recipe, and is published once.
const seen = new Set();

for (const entry of keep) {
  const source = sourceOf(entry);
  if (!source || !existsSync(source.recipe)) {
    skipped.push(`${entry}: no recipe behind it`);
    continue;
  }

  const recipe = JSON.parse(readFileSync(source.recipe, "utf8"));
  const id = recipeId(recipe);
  if (seen.has(id)) {
    skipped.push(`${entry}: the same recipe as a line above`);
    continue;
  }
  seen.add(id);
  const known = await patiently(() => lookup(id, ledger));
  if (known.author) {
    skipped.push(`${entry}: already owned by ${known.author}`);
    continue;
  }

  if (!publishing) {
    console.log(`would publish  ${recipe.name.padEnd(30)} ${id.slice(0, 12)}…`);
    continue;
  }

  const hash = await patiently(() =>
    wallet.writeContract({ address: ledger.book, abi, functionName: "publish", args: [id] }),
  );
  await publicClient.waitForTransactionReceipt({ hash });

  const filed = catalogEnabled()
    ? await saveRecipe({
        id,
        recipe,
        preview: existsSync(source.preview) ? source.preview : null,
      })
    : { saved: false };

  published += 1;
  console.log(
    `published  ${recipe.name.padEnd(30)} ${id.slice(0, 12)}…  tx ${hash.slice(0, 12)}…` +
      `${filed.saved ? "  + catalog" : ""}`,
  );
}

console.log(`\n${publishing ? `${published} published` : "Nothing sent: add --publish to do it."}`);
for (const line of skipped) console.log(`skipped  ${line}`);

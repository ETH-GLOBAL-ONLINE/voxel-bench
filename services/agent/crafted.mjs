// Who crafted what, kept by the agent and by nobody else.
//
// A recipe's id is the hash of its content, and a recipe nobody has claimed
// can be claimed by whoever signs for it first — the audit's SR-01. A
// signature proves a wallet, not the work. The one place that knows who did
// the work is here: every craft is charged to a signed-in person's budget. So
// the agent writes that down, and a claim is relayed only for that person.
//
// This file is private. A recipe reaches the public catalog when it is
// claimed and not before; a list of unclaimed ids anywhere public would be the
// very thing the audit warns about.
//
// A JSON file rather than a database: it lives beside the crafter's output,
// survives a restart, and stays small. It is written whole on every change,
// through a temporary file, so a crash mid-write leaves the old one intact.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const key = (id) => String(id ?? "").toLowerCase();
const addr = (a) => String(a ?? "").toLowerCase();

export function openCrafted(file) {
  let entries = {};
  try {
    entries = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // No file yet, which is how every bench starts.
  }

  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(entries, null, 2));
    renameSync(tmp, file);
  };

  return {
    /**
     * Note that `crafter` had this recipe crafted. The same recipe can be
     * crafted by two people — two identical obbies have one id — and each of
     * them may claim it; the chain decides who was first.
     */
    record({ id, name, recipe, crafter, chain }) {
      const k = key(id);
      const entry = entries[k] ?? {
        id: k,
        name: name ?? null,
        recipe: recipe ?? null,
        chain: chain ?? null,
        crafters: [],
        at: new Date().toISOString(),
        claimed: null,
      };
      if (crafter && !entry.crafters.includes(addr(crafter))) entry.crafters.push(addr(crafter));
      if (name) entry.name = name;
      if (recipe) entry.recipe = recipe;
      if (chain) entry.chain = chain;
      entries[k] = entry;
      save();
      return entry;
    },

    get(id) {
      return entries[key(id)] ?? null;
    },

    /** Whether `author` may claim this recipe: only someone who crafted it here, and only once. */
    mayClaim(id, author) {
      const entry = entries[key(id)];
      return Boolean(entry && !entry.claimed && entry.crafters.includes(addr(author)));
    },

    markClaimed(id, { author, transaction = null } = {}) {
      const entry = entries[key(id)];
      if (!entry) return null;
      entry.claimed = { author: addr(author), transaction, at: new Date().toISOString() };
      save();
      return entry;
    },

    /** What `address` crafted and has not claimed, newest first. */
    unclaimedOf(address) {
      const me = addr(address);
      return Object.values(entries)
        .filter((e) => !e.claimed && e.crafters.includes(me))
        .sort((a, b) => b.at.localeCompare(a.at));
    },
  };
}

// node --test crafted.test.mjs
//
// The note of who crafted what, and the rule it enforces: a recipe is claimed
// by someone who crafted it here, and by nobody else.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openCrafted } from "./crafted.mjs";

const ID = "0x" + "ab".repeat(32);
const ALICE = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const BOB = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB";
const recipe = { name: "crate_1234", ingredients: [{ shape: "cube" }] };

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "crafted-"));
  return { dir, file: join(dir, "crafted.json") };
}

test("only the crafter may claim, and only once", () => {
  const { dir, file } = fresh();
  const crafted = openCrafted(file);

  assert.equal(crafted.mayClaim(ID, ALICE), false, "nothing crafted yet");

  crafted.record({ id: ID, name: recipe.name, recipe, crafter: ALICE, chain: "Hedera Testnet" });
  assert.equal(crafted.mayClaim(ID, ALICE), true);
  assert.equal(crafted.mayClaim(ID.toUpperCase().replace("0X", "0x"), ALICE.toLowerCase()), true, "ids and addresses compare case-insensitively");
  assert.equal(crafted.mayClaim(ID, BOB), false, "a stranger with a valid signature is still a stranger");

  crafted.markClaimed(ID, { author: ALICE, transaction: "0x01" });
  assert.equal(crafted.mayClaim(ID, ALICE), false, "claimed once is claimed");
  assert.equal(crafted.get(ID).claimed.author, ALICE.toLowerCase());

  rmSync(dir, { recursive: true, force: true });
});

test("two people who crafted the same recipe may both claim it", () => {
  const { dir, file } = fresh();
  const crafted = openCrafted(file);
  crafted.record({ id: ID, name: recipe.name, recipe, crafter: ALICE });
  crafted.record({ id: ID, name: recipe.name, recipe, crafter: BOB });
  assert.equal(crafted.mayClaim(ID, ALICE), true);
  assert.equal(crafted.mayClaim(ID, BOB), true);
  assert.deepEqual(crafted.get(ID).crafters, [ALICE.toLowerCase(), BOB.toLowerCase()]);
  rmSync(dir, { recursive: true, force: true });
});

test("a craft with nobody signed in can be claimed by nobody", () => {
  const { dir, file } = fresh();
  const crafted = openCrafted(file);
  crafted.record({ id: ID, name: recipe.name, recipe, crafter: null });
  assert.equal(crafted.mayClaim(ID, ALICE), false);
  assert.deepEqual(crafted.unclaimedOf(ALICE), []);
  rmSync(dir, { recursive: true, force: true });
});

test("the unclaimed list is per person, newest first, and drops what is claimed", () => {
  const { dir, file } = fresh();
  const crafted = openCrafted(file);
  const OLDER = "0x" + "01".repeat(32);
  const NEWER = "0x" + "02".repeat(32);
  const THEIRS = "0x" + "03".repeat(32);

  const older = crafted.record({ id: OLDER, name: "a", recipe, crafter: ALICE });
  older.at = "2026-09-12T00:00:00.000Z";
  const newer = crafted.record({ id: NEWER, name: "b", recipe, crafter: ALICE });
  newer.at = "2026-09-12T01:00:00.000Z";
  crafted.record({ id: THEIRS, name: "c", recipe, crafter: BOB });

  assert.deepEqual(crafted.unclaimedOf(ALICE).map((e) => e.id), [NEWER, OLDER]);
  assert.deepEqual(crafted.unclaimedOf(BOB).map((e) => e.id), [THEIRS]);

  crafted.markClaimed(NEWER, { author: ALICE });
  assert.deepEqual(crafted.unclaimedOf(ALICE).map((e) => e.id), [OLDER]);
  rmSync(dir, { recursive: true, force: true });
});

test("what is written survives a reopen, and a missing file is an empty note", () => {
  const { dir, file } = fresh();
  assert.equal(existsSync(file), false);
  const first = openCrafted(file);
  assert.deepEqual(first.unclaimedOf(ALICE), []);

  first.record({ id: ID, name: recipe.name, recipe, crafter: ALICE, chain: "Arc Testnet" });
  assert.equal(existsSync(file), true);
  assert.equal(existsSync(`${file}.tmp`), false, "the temporary file is renamed away");

  const again = openCrafted(file);
  assert.equal(again.mayClaim(ID, ALICE), true);
  assert.equal(again.get(ID).chain, "Arc Testnet");
  assert.deepEqual(again.get(ID).recipe, recipe);
  rmSync(dir, { recursive: true, force: true });
});

// An obby, as a recipe of recipes.
//
// The pieces are recipes already on the shelf: a start pad, platforms, a ramp,
// hazards, a finish. Laid out as a course a Roblox character can run, their
// ingredients become one recipe that the crafter builds like any other. The
// recipe keeps the list of pieces it was made from, so crafting it can pay the
// author of every piece, not only whoever put the course together.
//
// Every piece is given a role — start, path, checkpoint, kill, move, finish or
// scenery — from its name. The Roblox writer turns each piece into its own
// model named after its role, and a script in the course gives the roles their
// behaviour: see bench/obby_runtime.lua.
import { fetchRecipes } from "./catalog.mjs";
import { recipeId } from "./recipes.mjs";

// A default Roblox character walks at 16 studs a second and jumps about seven
// studs high, which carries it about eight across on the flat. Every jump here
// stays under that, and is shorter when it climbs.
const BASE = 8; // the start's surface, above the ground
const MAX_CLIMB = 10; // how far above the start the course may rise
const HAZARD_GAP = 6; // the jump over a hazard
const HAZARD_DROP = 2.5; // how far below the path a hazard lies
// The validator refuses anything wider than this on any axis.
const MAX_LENGTH = 120;
export const MAX_PIECES = 12;

const round = (v) => Math.round(v * 1000) / 1000;

/** Bounding box of a set of ingredients in studs, ignoring rotation. */
function box(ingredients) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const ing of ingredients) {
    for (let i = 0; i < 3; i++) {
      const half = Math.abs(ing.scale[i]) / 2;
      lo[i] = Math.min(lo[i], ing.loc[i] - half);
      hi[i] = Math.max(hi[i], ing.loc[i] + half);
    }
  }
  return { lo, hi };
}

/**
 * The height a character stands at on a piece: the top of its broad parts,
 * not of a pole, a beacon or a flag.
 */
function surface(ingredients) {
  const foot = (ing) => Math.abs(ing.scale[0] * ing.scale[1]);
  const widest = Math.max(...ingredients.map(foot));
  return Math.max(
    ...ingredients
      .filter((ing) => foot(ing) >= widest / 2)
      .map((ing) => ing.loc[2] + Math.abs(ing.scale[2]) / 2),
  );
}

/** What a piece does in the course, read from its name. */
function kindOf(name, ingredients) {
  const n = name.toLowerCase();
  if (/start/.test(n)) return "start";
  if (/finish|goal|podium/.test(n)) return "finish";
  if (/checkpoint/.test(n)) return "checkpoint";
  if (/hazard|lava|spike|kill/.test(n)) return "kill";
  if (/moving|mover|elevator/.test(n)) return "move";
  if (/platform|stepping|stone|ramp|bridge|walkway/.test(n)) return "path";
  // Anything else stands beside the course, unless it is broad and low enough
  // to be stood on.
  const { lo, hi } = box(ingredients);
  const broad = (hi[0] - lo[0]) * (hi[1] - lo[1]) >= 9;
  return broad && surface(ingredients) - lo[2] <= 2.5 ? "path" : "scenery";
}

const WALKABLE = new Set(["start", "path", "checkpoint", "move", "finish"]);

/** The same pieces always make the same course, so the recipe id is stable. */
function random(seed) {
  let a = parseInt(seed.slice(2, 10), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lay these recipes out as a course, in the order given. Every piece is read
 * from the catalog and checked against its id; the result is a new recipe,
 * with its own id, that nobody owns until someone claims it.
 *
 * Pieces to stand on float in a line, each a jump from the last and a little
 * higher or lower. A hazard lies in the gap before the next piece to stand on,
 * below the jump, so falling short lands in it. Scenery stands on the ground
 * beside the course.
 */
export async function composeObby(ids) {
  if (!Array.isArray(ids) || ids.length < 2) {
    throw new Error("An obby needs at least two pieces.");
  }
  if (ids.length > MAX_PIECES) {
    throw new Error(`An obby takes at most ${MAX_PIECES} pieces.`);
  }

  // One read for every piece; a catalog that cannot be read says so rather
  // than blaming a piece.
  const found = await fetchRecipes(ids);
  const pieces = [];
  for (const id of ids) {
    const recipe = found.get(id.toLowerCase());
    if (!recipe) throw new Error(`A piece is not in the catalog: ${id.slice(0, 10)}…`);
    const kind = kindOf(recipe.name, recipe.ingredients);
    pieces.push({ id: id.toLowerCase(), name: recipe.name, recipe, kind });
  }

  const walkable = pieces.filter((p) => WALKABLE.has(p.kind));
  if (!walkable.length) {
    throw new Error("An obby needs something to stand on: a start pad or a platform.");
  }
  // A course always has a start and a finish: without them, the first and last
  // pieces to stand on take those roles.
  if (!pieces.some((p) => p.kind === "start")) walkable[0].kind = "start";
  if (!pieces.some((p) => p.kind === "finish") && walkable.length > 1) {
    walkable[walkable.length - 1].kind = "finish";
  }

  const seed = recipeId({ pieces: ids.map((id) => id.toLowerCase()) });
  const rand = random(seed);
  const pick = (options) => options[Math.floor(rand() * options.length)];

  const ingredients = [];
  const parts = [];
  const place = (i, piece, at) => {
    const group = `p${i + 1}_${piece.name.replace(/^obby_/, "")}`.slice(0, 48);
    for (const ing of piece.recipe.ingredients) {
      ingredients.push({
        ...ing,
        name: `p${i + 1}_${ing.name}`,
        loc: ing.loc.map((v, k) => round(v + at[k])),
        role: piece.kind,
        group,
      });
    }
    parts.push({ id: piece.id, name: piece.name, kind: piece.kind, at: at.map(round) });
  };

  let cursor = 0; // where the next piece to stand on may begin, along the course
  let height = BASE; // the surface the player is standing on
  let stood = 0; // pieces to stand on laid so far
  let lastMiddle = 0; // middle of the last of them, for scenery
  let side = 1; // which side the next piece of scenery goes
  let pending = []; // hazards waiting for the gap they will lie in

  // Hazards lie centred under the jump that starts at `from`, below the path.
  // Two in a row lie side by side rather than making a jump nobody can make.
  const layHazards = (from) => {
    pending.forEach(({ i, piece, lo, hi }, j) => {
      const width = hi[1] - lo[1];
      const lateral = j === 0 ? 0 : (j % 2 ? 1 : -1) * Math.ceil(j / 2) * (width + 0.5);
      const middle = from + HAZARD_GAP / 2;
      place(i, piece, [
        middle - (lo[0] + hi[0]) / 2,
        lateral - (lo[1] + hi[1]) / 2,
        height - HAZARD_DROP - hi[2],
      ]);
    });
    pending = [];
  };

  pieces.forEach((piece, i) => {
    const { lo, hi } = box(piece.recipe.ingredients);

    if (piece.kind === "kill") {
      pending.push({ i, piece, lo, hi });
      return;
    }

    if (piece.kind === "scenery") {
      const depth = hi[1] - lo[1];
      place(i, piece, [
        lastMiddle - (lo[0] + hi[0]) / 2,
        side * (5 + depth / 2) - (lo[1] + hi[1]) / 2,
        -lo[2],
      ]);
      side = -side;
      return;
    }

    // Something to stand on. The first is at the base; each after it is a
    // jump away. A jump over a hazard stays level; the rest climb or drop a
    // little, and a small landing gets a shorter jump.
    let gap = 0;
    if (pending.length) {
      gap = HAZARD_GAP;
      layHazards(cursor);
    } else if (stood > 0) {
      const climb = pick([0, 1, 1.5, 2.5, -1, -1.5]);
      height = Math.min(BASE + MAX_CLIMB, Math.max(BASE, height + climb));
      gap = climb > 0 ? 3.5 + rand() : 4 + rand() * 1.5;
      if (hi[0] - lo[0] < 3) gap = Math.min(gap, 4);
    }

    const start = cursor + gap;
    const lateral = stood > 0 ? (rand() * 2 - 1) * 1.5 : 0;
    place(i, piece, [
      start - lo[0],
      lateral - (lo[1] + hi[1]) / 2,
      height - surface(piece.recipe.ingredients),
    ]);
    lastMiddle = start + (hi[0] - lo[0]) / 2;
    cursor = start + (hi[0] - lo[0]);
    stood++;
  });
  // Hazards after the last piece lie at the end, where the course stops.
  if (pending.length) layHazards(cursor);

  const whole = box(ingredients);
  const length = whole.hi[0] - whole.lo[0];
  if (length > MAX_LENGTH) {
    throw new Error(
      `That course is ${Math.round(length)} studs long and the limit is ${MAX_LENGTH}. ` +
        "Take a piece or two out.",
    );
  }

  // Centred on the origin, so the preview frames it and Roblox drops it where
  // it is placed.
  const shift = -(whole.lo[0] + whole.hi[0]) / 2;
  for (const ing of ingredients) ing.loc[0] = round(ing.loc[0] + shift);
  for (const part of parts) part.at[0] = round(part.at[0] + shift);

  // Named after its pieces, so two different courses of the same length do not
  // overwrite each other's files.
  const tag = seed.slice(2, 8);
  const recipe = {
    name: `obby_${pieces.length}_pieces_${tag}`,
    units: "studs",
    parts,
    ingredients,
  };

  return { recipe, pieces, length: round(length) };
}

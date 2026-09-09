# Building the recipe library

**Stefan — this one is yours.** It is the highest-leverage thing anyone can do
on this project right now, and it needs your eye more than it needs mine.

## What I need from you

A set of recipes that are good enough for the model to imitate.

A recipe is a small JSON file describing an object as composed primitives. That
is the format the whole pipeline speaks, so it is the one thing that has to keep
a fixed shape. Everything else is up to you.

Concretely:

- **Objects that read as what they are** at game distance, correctly scaled
  against a 5-stud character.
- **Sets rather than singles** — enough related objects that a level could be
  assembled from one kit.
- **Notes on what the model gets wrong repeatedly.** These may be worth more
  than the recipes; see [What to write down](#what-to-write-down).

## How you get there is yours

Use whatever you already work in. Blender, Blender MCP, an agent, modelling
something and reading the numbers off it, or writing the JSON straight — all
fine. You do not need to run any of this project to contribute to it.

**The simplest handoff:** send me the JSON and I will craft it and send back the
render. No setup, no keys, no Python — you should not have to run any of this to
contribute to it. If you do want the pipeline on your machine at some point, ask
and I will set it up with you.

The rest of this is the format, what tends to read well, and a catalogue of what
would be useful. Take the parts that help.

---

## Why it matters

A curated library fixes three separate problems at once:

**The model gets better without changing the model.** It currently sees a single
worked example, the same one for every prompt whatever was asked. Give it fifteen
good ones and show it the two or three closest to the request, and the output
improves at no extra cost per craft.

**Latency disappears for anything in the library.** A recipe that already exists
needs no model call. It crafts instantly, and its author is paid. Right now the
free tier takes anywhere from 3 to 48 seconds; a library hit takes none.

**The marketplace has stock on day one.** An empty marketplace cannot be
demonstrated. Forty recipes can.

And a fourth thing that may be worth more than the recipes: **you will see what
the model gets wrong repeatedly.** If twenty objects come back with legs too
thin, that is one line added to the prompt which fixes all twenty at once, and
every future one. See [What to write down](#what-to-write-down).

---


## One thing worth knowing before you start

When the model writes a recipe on its own, it gets the *idea* right and the
*craft* wrong — proportions off, everything axis-aligned, four legs at an
identical colour. That gap is the entire reason this is your job and not the
model's, and it is also what the library is for: give it good work to imitate
and the gap narrows.

So a recipe that came out of the model is a draft. Treat it as a starting point
to correct rather than an answer to accept.

---

## The recipe format

```jsonc
{
  "name": "stone_lantern",
  "units": "studs",            // always studs. Never metres.
  "ingredients": [
    {
      "name": "base",          // descriptive; it becomes the Part name in Roblox
      "shape": "cube",         // cube | cylinder | sphere | cone | plane
      "loc":   [0, 0, 0.6],    // CENTRE of the piece. X right, Y depth, Z up
      "scale": [2.2, 2.2, 1.2],// FULL width, depth, height. Not a radius.
      "color": [0.42, 0.41, 0.38], // linear RGB, 0-1
      "rot":   [0, 0, 8],      // degrees, optional
      "bevel": 0.04            // optional, rounds the edges in the preview
    }
  ]
}
```

Four rules that cause most mistakes:

- **`scale` is the full size, not a radius.** A cylinder with scale `[1, 1, 4]`
  is 1 stud across and 4 tall.
- **`loc` is the centre.** A leg 3 studs tall standing on the ground has
  `loc.z = 1.5`, not `0`.
- **Z is up**, and the object sits on `z = 0`. Nothing should float unless you
  meant it to.
- **Colours are linear, not what you would type into a colour picker.** Wood is
  around `[0.45, 0.29, 0.15]`, not `[1, 0.5, 0]`. They come out lighter than
  they look here — that conversion is handled, so trust the render, not the
  numbers.

Scale reference: **a Roblox character is 5 studs tall.** A chair is about 3, a
door 7, a market stall 9, a lamp post 12, a small house 20. The preview shows a
grey 5-stud figure beside the object so you can judge by eye.

---

## What makes a recipe good

You know this better than I do, so treat the list below as what happened to turn
up rather than what actually matters. If it disagrees with your eye, your eye
wins — and I would like to hear why.

- **Silhouette first.** If the outline does not read, no amount of detail saves
  it. Objects are seen from ten studs away while running past.
- **Vary colours between pieces of the same material.** Four legs at exactly
  `[0.45, 0.29, 0.15]` looks generated. Nudge each by a few percent. This is the
  single strongest tell of a machine-made build.
- **A few degrees of rotation.** A crate at 7° reads as placed by a person. A
  crate at 0° reads as placed by a loop.
- **Six to twelve pieces.** Fewer looks unfinished; more rarely adds anything
  visible at game distance, and every piece costs the person waiting.
- **One or two detail pieces that sell it.** Something resting on the counter,
  a leaf on the ground beside the bench. One ingredient each, and they do more
  for believability than any amount of structure.
- **Sit it on the ground.** Check the lowest piece reaches `z = 0`.

---

## What the vocabulary does well, and badly

We have five primitives: **cube, cylinder, sphere, cone, plane.** That is a real
constraint and it should shape what you build.

**Good fits — lean into these:**
architecture, furniture, containers, machinery, vehicles, signage, anything
modular or boxy. Roblox's own art style is blocky, so this is not a compromise,
it is the house style.

**Poor fits — avoid or stylise heavily:**
organic curves, characters and creatures, cloth and rope, foliage in detail,
anything that needs a real mesh. A tree works as a cylinder trunk with cone or
sphere masses; a dragon does not work at all.

Two notes: **Roblox has no cone** — a cone is approximated as a cylinder when it
lands there, and the report tells you when that happened. And **`plane` is a very
thin cube**, useful for signs, leaves and decals.

If something in the catalogue below turns out to be impossible with five shapes,
say so — that is useful information, and adding a wedge is a small change.

### Shape is one limit. Look is a different one, and it is ours

The five primitives limit what **shape** you can build. They do not limit how it
**looks**, and those two get confused easily.

What comes out today is the plainest thing Roblox can draw: flat colours, no
material, default lighting, no atmosphere. That is a decision nobody has got to
yet, not a ceiling. Roblox itself supports rather more — per-part materials with
real surface texture, `Neon` for anything meant to glow, and place-level
lighting, atmosphere and colour grading that change how the same object reads
more than any amount of extra geometry would.

You have Studio, so you can see this before any of it is wired into the
pipeline: drop a `.rbxmx` in, set a part's `Material` to `Wood` or
`CorrodedMetal`, make the glowing bit `Neon`, try `Future` lighting with an
`Atmosphere`. If that gets an object where you want it, tell me and it becomes a
field in the recipe. That is a faster way to settle it than arguing about it.

**So when something looks wrong, say which of the two it is.** "This needs more
shapes" and "this needs to be rusted metal instead of grey" are different
problems with different fixes, and the second is usually cheaper than it looks.

---

## The catalogue

**These are suggestions, not an assignment.** We wrote them to show the *shape*
worth aiming at — a kit complete enough that someone could assemble a playable level
from it alone, rather than a pile of unrelated props. That is the idea worth
keeping.

The themes themselves are off the top of my head. If you would rather build a
wild-west town, a haunted carnival, a pirate cove or something I did not think
of, do that. You have the eye for what makes a coherent set and what players
respond to, and a theme you want to finish beats one from this list that you
don't.

Two things either way:

- **The universal obby kit first.** The playable demo depends on it, and it is
  simple enough to calibrate against.
- **Then one theme, finished.** One complete set beats four half-done ones,
  whichever set it is.

### Universal — the obby kit (do this first)

Every obstacle course needs these regardless of setting. They are also the
simplest, so they are a good place to calibrate.

| Object | Notes |
|---|---|
| `platform_small` | ~6×6 studs, the basic jump target |
| `platform_long` | ~16×6, a walkway |
| `platform_thin` | ~3×3, a hard jump |
| `stepping_stone` | round, floating |
| `checkpoint` | the classic Roblox flag or pad — should read as "safe" |
| `start_pad` | where the run begins |
| `finish_podium` | the reward at the end, should feel like an arrival |
| `hazard_spikes` | reads as "do not touch" |
| `hazard_lava_pool` | a flat pool, bright |
| `moving_platform_base` | visually distinct from static ones |
| `ramp` | a wedge shape made from a rotated cube |
| `barrier_wall` | blocks a path |
| `arrow_sign` | points the way |
| `rope_bridge` | planks and rails |

### Theme A — Ninja, Japanese landscape

| Object | Notes |
|---|---|
| `torii_gate` | the signature silhouette of the whole theme |
| `pagoda_small` | stacked tiled roofs |
| `pagoda_tower` | three or four storeys |
| `stone_lantern` | the classic tōrō |
| `paper_lantern` | hanging, warm colour |
| `cherry_blossom_tree` | trunk plus pink sphere masses |
| `bamboo_cluster` | thin tall cylinders, varied heights |
| `wooden_bridge_arched` | over water |
| `koi_pond` | a flat pool with a stone rim |
| `zen_rock_garden` | raked gravel plane plus boulders |
| `tiled_roof_section` | modular, so it repeats |
| `dojo_door` | sliding, framed |
| `stone_stairs` | a flight |
| `weapon_rack` | katana stand |
| `banner_vertical` | cloth banner on a pole |

### Theme B — Space horror, derelict ship

| Object | Notes |
|---|---|
| `bulkhead_door` | heavy, sealed, with a wheel or panel |
| `corridor_section` | modular walls and ceiling so it tiles |
| `floor_grating` | plane with a pattern of gaps |
| `pipe_cluster` | cylinders along a wall |
| `wall_console` | screens and buttons |
| `supply_crate` | already exists as `sci_fi_supply_crate` |
| `cryo_pod` | upright, a window |
| `airlock_frame` | |
| `emergency_light` | wall-mounted, red |
| `locker_bank` | a row of lockers |
| `med_station` | |
| `alien_pod` | organic — stylise hard, spheres and cones |
| `cable_bundle` | drooping from a ceiling |
| `warning_sign` | plane with stripes |
| `vent_grate` | |

### Theme C — Kaiju, a city being flattened

| Object | Notes |
|---|---|
| `skyscraper_intact` | tall, windows as a repeating pattern |
| `skyscraper_damaged` | a chunk missing, exposed floors |
| `building_low_rise` | shopfront |
| `car_sedan` | |
| `city_bus` | |
| `street_lamp` | |
| `traffic_light` | |
| `fire_hydrant` | |
| `rubble_pile` | scattered cubes, varied rotation |
| `billboard` | |
| `water_tower` | rooftop |
| `shipping_container` | |
| `subway_entrance` | |
| `road_barricade` | |
| `crane_tower` | |

### Theme D — Nature, useful in every theme

| Object | Notes |
|---|---|
| `tree_pine` | cone masses on a cylinder |
| `tree_oak` | sphere masses |
| `tree_dead` | bare branches, hard with five shapes — try it and report |
| `bush` | |
| `boulder` | |
| `rock_small` | |
| `log_fallen` | |
| `tree_stump` | |
| `grass_tuft` | |
| `mushroom_cluster` | |

**Realistic target for the week:** the universal kit plus one theme finished
well, around 25 to 30 recipes. If a theme is going quickly, take a second one.

And if while building you find an object that is not in any list and obviously
belongs — the thing that makes the set feel real — add it. The catalogue is a
floor, not a ceiling.

---

## Naming and where to save

If you are handing the files to me rather than committing them yourself, only
the first two points matter — ignore the git part.

- Good ones go in `bench/recipes/`, as `snake_case.json`.
- The filename should match the `name` field inside.
- Prefix with the theme where it helps: `ninja_torii_gate.json`,
  `space_bulkhead_door.json`, `obby_platform_small.json`.
- Anything in `out/` is scratch and gitignored — nothing is lost from there
  except your time, so move the keepers out.

**Committing:** branch, commit, open a pull request — never straight to `main`.
See [CONTRIBUTING.md](../CONTRIBUTING.md). Use `track-b/recipes-<theme>` as the
branch name. A pull request per finished theme beats one enormous one at the end.

---

## What to write down

This is the part that outlives the recipes. Keep a running list of what the
model gets wrong **systematically** — patterns, not one-offs.

Examples of what a useful note looks like:

- "Legs and posts always come out too thin. It uses 0.2 where 0.4 reads better."
- "It never uses `rot`, so everything is machine-aligned."
- "It puts the object's centre at z=0 instead of its base, so half sinks."
- "Colours for the same material are identical across pieces."

Each of those is one line added to the prompt in `bench/describe.py` that fixes
every future craft at once. Twenty recipes are worth a lot; four observations
like these are worth more.

Drop them in this file under a "Notes" heading, or in the PR description — either
is fine, as long as they are written down rather than remembered.

---

## Gotchas

Things that have already cost time on this project.

- **A negative size is not rejected.** Roblox clamps it to 0.001, so the part is
  there, is the right colour, and is invisible. If a piece vanishes, check for a
  negative number.
- **Nothing should be more than about 60 studs on any axis.** The validator
  rejects anything past 120 as a units mistake, which it usually is.
- **The preview render and Roblox are not identical.** The render is Blender's
  idea of the object; Roblox has flat colours and no bevels. Trust the `.rbxmx`
  in Studio for the final word.
- **Very thin pieces disappear at distance.** Under about 0.1 studs, Roblox may
  not draw it reliably. Use 0.2 as a practical floor for anything visible.
- **Check it against the figure, not the numbers.** The preview puts a 5-stud
  grey character beside every object for exactly this reason.

---

## Questions worth asking early

If any of these turn out badly, better to find out in the first day of looking
than on the last day before submission.

- Which catalogue objects are **impossible** with five primitives? A wedge would
  be a small addition if several need it.
- Does a **more expensive model** produce better recipes, or just longer ones?
  You are the only one who can judge that. Same prompt, two models, side by
  side. The big model measurably writes *more* ingredients — 13 against 9 — and
  whether that means better is an open question.
- Should recipes carry a **Roblox material** (`Wood`, `Metal`, `Slate`)? It costs
  nothing and adds real surface texture, but the Blender preview would not show
  it unless the preview approximates it too.

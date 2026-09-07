# Voxel Bench

The workbench where Roblox game objects get crafted.

Type "a wooden market stall" and seconds later you have the object, built and
already uploaded into Roblox, ready to drop into your game. No Blender, no
Studio, nothing to install.

Every object is crafted from a reusable **recipe**. Whoever wrote the recipe
earns a slice every time someone crafts with it, split onchain automatically.

> **On scope:** Roblox prohibits blockchain integrations and off-platform
> monetisation, so no Roblox in-game revenue is ever touched — what your game
> earns is yours, in full. The onchain economy is entirely our own: crafting
> fees, publishing fees and recipe royalties. Roblox is an export target, not
> the platform. The pipeline also emits GLB for any other engine.

See [PLAN.md](PLAN.md) for the full plan, [docs/ONCHAIN.md](docs/ONCHAIN.md) for how
the chain is used and why, [docs/LOG.md](docs/LOG.md) for what has actually been
built and measured so far, [CONTRIBUTING.md](CONTRIBUTING.md) for how
we work, and [AI_USAGE.md](AI_USAGE.md) for the AI disclosure required by
ETHOnline 2026.

## Pipeline

```
prompt -> recipe (JSON) -> headless Blender -> FBX + GLB + preview
                                            -> Roblox Open Cloud -> assetId
```

Each stage is an x402-gated service. The orchestrating agent pays per craft from
its own wallet, under a spending cap it cannot raise itself. No API keys are
shared between stages.

## Vocabulary

One word per concept, in the contract, the API and the UI alike.

| Word | Means |
|---|---|
| recipe | the reusable JSON description of an object |
| ingredients | the primitives a recipe is composed of |
| craft | the verb: run a recipe, pay, get an asset |
| crafter | someone who crafts with a recipe |
| author | whoever wrote the recipe, and earns from it |
| RecipeBook | the contract holding recipes, authors and splits |

## Status

- [x] Crafter: recipe JSON to FBX/GLB/PNG, headless, ~7s for a 400-triangle prop
- [ ] Studs scaling (1 stud is about 0.28 m; a character is ~5 studs tall)
- [ ] Publisher: written, untested — needs a Roblox Open Cloud API key
- [ ] `RecipeBook` contract and splits
- [ ] x402 gating and the onchain spending cap
- [ ] Bench UI

## Crafting locally

```bash
blender --background --python bench/craft.py -- bench/recipes/market_stall.json out
```

Requires Blender 5.x. Outputs land in `out/`, which is gitignored, with a
`.report.json` beside them.

`samples/` holds one crafted object checked into the repo. The site falls back
to it, so a fresh clone shows a populated bench without anyone having to install
Blender.

## Running the site

```bash
cd web && npm install && npm run dev
```

## Publishing to Roblox

Needs an API key from create.roblox.com/dashboard/credentials with the `assets`
scope (read and write), and the creator id.

The key carries an IP allowlist. Leave it empty and every request returns 403
with a message that never mentions the IP — this is the single most common way
to lose an hour here.

```bash
export ROBLOX_API_KEY=...  ROBLOX_USER_ID=...
python services/roblox_upload.py out/market_stall.fbx "Market Stall"
```

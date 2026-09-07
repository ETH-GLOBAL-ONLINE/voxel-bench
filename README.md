# Voxel Bench

**Craft your Roblox game, one object at a time.**

Describe what you need. An agent builds it in Blender, uploads it straight to
your own Roblox account, and pays for each step from its own wallet. The user
installs nothing — no Blender, no Studio.

Every object is crafted from a reusable **recipe**. Whoever wrote the recipe
earns a slice every time someone crafts with it, split onchain.

Built from scratch for **ETHOnline 2026**.

## The claim, and its bounds

> You can build a playable Roblox game from this platform, within the genres we
> support, and refine it in Studio.

Not "any game" — that would be a lie, and anyone who knows Roblox would spot it.
Three stages:

| Stage | What | State |
|---|---|---|
| 1 | **Objects.** A prompt becomes a crate, a lamp post, a market stall | crafting works; upload untested |
| 2 | **Objects that do something, and a marketplace.** Luau ships with the object; recipes get published so others can craft with yours | planned |
| 3 | **A whole game, one genre at a time.** An obby is a sequence of platforms, hazards and checkpoints — spatial arrangement of objects. An obby is a recipe of recipes | planned |

> **On scope:** Roblox prohibits blockchain integrations and off-platform
> monetisation, so no Roblox in-game revenue is ever touched — what your game
> earns is yours, in full. The onchain economy is entirely our own: crafting
> fees, publishing fees and recipe royalties. Roblox is an export target, not
> the platform, and the pipeline also emits GLB for any other engine.

## Documents

| | |
|---|---|
| [PLAN.md](PLAN.md) | the plan: schedule, decisions and why, risks, the demo structure |
| [docs/ONCHAIN.md](docs/ONCHAIN.md) | every use of the chain, the non-blockchain alternative we rejected, and the sponsor tracks |
| [docs/LOG.md](docs/LOG.md) | what has actually been built and measured, and what has not |
| [CONTRIBUTING.md](CONTRIBUTING.md) | branches, PRs, commits, secrets |
| [AI_USAGE.md](AI_USAGE.md) | the AI disclosure required by the rules |

## Pipeline

```
prompt -> recipe (JSON) -> headless Blender -> FBX + GLB + preview
                                            -> Roblox Open Cloud -> assetId
```

The intent is for each stage to be a separate x402-gated service, so the
orchestrating agent pays per craft from its own wallet under a cap it cannot
raise itself, and no secrets are shared between stages. **Not built yet** — see
the status below and `docs/ONCHAIN.md` for the design.

## Where it runs

Blender cannot run on Vercel — serverless has no room for a 500 MB binary and no
persistent machine to run it on. So the site and the crafter live apart:

| Piece | Runs on |
|---|---|
| The site | Vercel |
| The crafter (Blender) | a real machine — a laptop behind a tunnel, or a VPS |

That split is the same one x402 asks for anyway: the crafter is a service that
charges per call.

It also means **the crafter is offline most of the time**, because laptops
close. The site checks `/api/bench/status` and says so plainly, falling back to
the checked-in sample rather than showing a broken page.

## Layout

```
bench/       the crafter: headless Blender, and the recipes it builds from
services/    the Roblox Open Cloud publisher
contracts/   RecipeBook, SplitVault, Allowance  (empty)
web/         the site: Next.js 16, TypeScript, Tailwind 4
             public/samples/ holds one crafted object so the site always shows something
docs/        onchain design, build log
out/         crafter output, gitignored
```

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

- [x] **Crafter** — recipe JSON to FBX/GLB/PNG, headless, ~7s for a 400-triangle prop
- [x] **Studs** — recipes authored in Roblox units, not metres
- [x] **Site** — Next.js scaffold, the crafted GLB orbitable in the browser
- [ ] **Publisher** — written, never talked to Roblox; needs an API key
- [ ] **Luau scripts** on objects
- [ ] **`RecipeBook`** contract and splits
- [ ] **x402 gating** and the onchain spending cap
- [ ] **The bench UI** — prompt in, preview out, approve, publish
- [ ] **Recipe marketplace**
- [ ] **An obby**

## Crafting locally

```bash
blender --background --python bench/craft.py -- bench/recipes/market_stall.json out
```

Requires Blender 5.x. Outputs land in `out/`, which is gitignored, with a
`.report.json` beside them.

`web/public/samples/` holds one crafted object checked into the repo. The site
falls back to it, so a fresh clone — and any deployment, where `out/` does not
exist at all — shows a populated bench without installing Blender.

## Running the site

```bash
cd web && npm install && npm run dev
```

## Publishing to Roblox

Needs an API key from create.roblox.com/dashboard/credentials with the `assets`
scope (read and write), and the creator id.

The key carries an IP allowlist. Leave it empty and every request returns 403
with a message that never mentions the IP — the single most common way to lose
an hour here.

```bash
export ROBLOX_API_KEY=...  ROBLOX_USER_ID=...
python services/roblox_upload.py out/market_stall.fbx "Market Stall"
```

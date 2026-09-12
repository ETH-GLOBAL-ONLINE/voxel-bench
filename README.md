# Voxel Bench

**Craft your Roblox game, one object at a time.**

Describe what you need. An agent builds it in Blender, uploads it straight to
your own Roblox account, and pays for each step from a budget you give it with
one signature. The user installs nothing — no Blender, no Studio.

Every object is crafted from a reusable **recipe**. Whoever wrote the recipe
earns a slice every time someone crafts with it, split onchain.

**Live: https://voxel-bench-psi.vercel.app**

Built from scratch for **ETHOnline 2026**.

## The claim, and its bounds

> You can build a playable Roblox game from this platform, within the genres we
> support, and refine it in Studio.

Not "any game" — that would be a lie, and anyone who knows Roblox would spot it.
Three stages:

| Stage | What | State |
|---|---|---|
| 1 | **Objects.** A prompt becomes a crate, a lamp post, a market stall | crafting and publishing work |
| 2 | **Objects that do something, and a marketplace.** Luau ships with the object; recipes get published so others can craft with yours | the marketplace works; scripts ship with obbies, not yet with single objects |
| 3 | **A whole game, one genre at a time.** An obby is a sequence of platforms, hazards and checkpoints — spatial arrangement of objects. An obby is a recipe of recipes | the obby works: pieces from the shelf become a course you play in Studio |

> **On scope:** Roblox prohibits blockchain integrations and off-platform
> monetisation, so no Roblox in-game revenue is ever touched — what your game
> earns is yours, in full. The onchain economy is entirely our own: crafting
> fees, publishing fees and recipe royalties. Roblox is an export target, not
> the platform, and the pipeline also emits GLB for any other engine.

## Documents

| | |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | **what works today and what is left, with where to start on each** |
| [docs/RECIPE_LIBRARY.md](docs/RECIPE_LIBRARY.md) | building the recipe library: the loop, the format, and a catalogue of themed kits |
| [PLAN.md](PLAN.md) | the plan: schedule, decisions and why, risks, the demo structure |
| [docs/PAYMENT_FLOW.md](docs/PAYMENT_FLOW.md) | **who pays what, and on which chain — the happy path in plain words** |
| [docs/ONCHAIN.md](docs/ONCHAIN.md) | every use of the chain, the non-blockchain alternative we rejected, and the sponsor tracks |
| [docs/LOG.md](docs/LOG.md) | what has actually been built and measured, and what has not |
| [CONTRIBUTING.md](CONTRIBUTING.md) | branches, PRs, commits, secrets |
| [FEEDBACK.md](FEEDBACK.md) | what cost us time in each sponsor's technology, with evidence |
| [AI_USAGE.md](AI_USAGE.md) | the AI disclosure required by the rules |

## Pipeline

```
prompt -> recipe (JSON) -> headless Blender -> GLB + preview render
                        -> native parts     -> .rbxmx -> Roblox
```

```bash
python bench/make.py "a stone well with a bucket"
```

One command runs all three stages — the model writes a recipe, Blender crafts
it, the Roblox writer turns it into native parts — and prints where each piece
landed.

The model writes the recipe and never touches Blender. Same recipe, same object,
every time — and when something looks wrong the recipe is a small readable file
you fix by hand rather than a dice roll you re-roll.

Roblox gets native parts rather than a mesh. FBX arrives exactly 100x too large
(it stores centimetres) and grey (Roblox imports textures, not material
colours); parts are written in studs and carry their own colour, so neither
problem exists. Blender still crafts the preview and the GLB for the web viewer
and other engines.

Each stage is a separate x402-gated service. The agent holds a wallet, is
quoted a price, pays it and is let through — no key is shared with any of them,
and no stage can do another's job. Its per-payment cap is enforced by the client
before a payment is even constructed.

```
             ENS
              │  names, prices, who is paid
              ▼
site  ──►  agent  ──402──►  paywall  ──►  crafter  ──►  Roblox
             │                    │
          wallet              3 prices
            cap             1 account paid
```

The site asks the agent, not the crafter. The visitor signs once, to give their
agent a budget in USDC on Arc; after that the browser watches the agent spend
it, stage by stage, and never holds a key. The platform pays every gas. Who pays
what, on which chain, is in [docs/PAYMENT_FLOW.md](docs/PAYMENT_FLOW.md).

The agent finds the services by resolving `recipe.voxelbench.eth`,
`craft.voxelbench.eth` and `publish.voxelbench.eth` on ENSv2, and each name
carries the price. When a 402 asks for something the name does not say, it does
not sign. A service may edit its own `url` record and not its price, so the two
numbers are not both written by the party being paid.

Each name also says which chain it settles on, so a service moves between them
by rewriting a record. Today `craft` settles in USDC on Arc while `recipe` and
`publish` settle in HBAR on Hedera — one agent, one identity, two rails.

Run it:

```bash
python services/crafter.py             # the work,     :8000
node services/paywall/server.mjs       # the prices,   :4402
node services/agent/server.mjs         # the wallet,   :4403
node services/facilitator/server.mjs   # the gas,      :4404
cd web && npm run dev                  # the site
```

On Arc the craft stage is paid through Circle Gateway (Nanopayments): the agent
keeps a USDC balance in Gateway and signs against it, and Circle settles the
payments in batches. The public facilitator at `x402.org` covers Hedera and not
Arc; ours, above, is the fallback for the Arc side when Gateway is not answering
(`VOXEL_ARC_SETTLEMENT=own` in `.env`).

Or from a terminal, without the site:

```bash
node services/agent/orchestrate.mjs "an oil drum"
```

The agent needs `HEDERA_AGENT_ACCOUNT_ID` and `HEDERA_AGENT_PRIVATE_KEY`. Without
them, point `web/.env.local` at `CRAFTER_URL` alone and the site crafts directly
for nothing — worth having, since running the bench should not require a funded
wallet.

`VOXEL_ENS_PARENT` turns on name resolution. Without it the agent uses
`PAYWALL_URL` and takes each price from the 402 that states it — enough to craft
on a fresh clone, with only its own cap and nothing to check a price against.

Running this for real is a separate question, answered in
[docs/MAINNET.md](docs/MAINNET.md): what carries over unchanged, what has to
change, and what is still unknown.

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
services/    the crafter, the paywall, the paying agent, the Arc facilitator, the Roblox publisher
contracts/   RecipeBook, SplitVault and Allowance, deployed on Hedera and Arc testnets
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
- [x] **Publisher** — verified against the live API, moderation approved
- [x] **Native Roblox parts** — `.rbxmx` with exact studs and colours
- [x] **A sentence becomes a recipe** — validated; 3-48s on the free tier, median 17s
- [x] **The bench** — prompt, progress, preview, orbit, publish, in the browser
- [x] **Publish to Roblox** — `.rbxmx` accepted; the account key stays in the browser
- [x] **Sign in without a wallet** — email, Google or X through Privy; claiming a recipe costs no gas
- [x] **Backpack** — what you own and what you collected, with previews
- [x] **Each person pays their own way** — a budget signed once, no gas; the USDC contract enforces it
- [ ] **Luau scripts** on objects — the obby carries one; single objects do not yet
- [x] **`RecipeBook` + `SplitVault`** — live on Hedera and Arc testnets, verified against the chain
- [x] **x402** — three stages, three prices, paid on Hedera testnet and verified on the ledger
- [x] **`Allowance`** — the cap as a contract, drawn from before every craft, one per chain
- [x] **Recipe marketplace** — the platform's stock and everyone's recipes; getting one pays its author
- [x] **An obby** — 2 to 12 recipes become a playable course: spawn, hazards, moving platforms, a timed finish

## Crafting locally

```bash
blender --background --python bench/craft.py -- bench/recipes/market_stall.json out
```

Requires Blender 5.x. Outputs land in `out/`, which is gitignored, with a
`.report.json` beside them.

`web/public/samples/` holds one crafted object checked into the repo. The site
falls back to it, so a fresh clone — and any deployment, where `out/` does not
exist at all — shows a populated bench without installing Blender.

## Building an obby

On the bench, **Build an obby** lists the pieces you own, the ones you
collected and the obby set on the marketplace. Pick them in the order a player
runs them and drag to reorder. The agent (`services/agent/obby.mjs`) lays them
out as a course that floats, climbs and drops between jumps a character can
make, with hazards below the jumps, and crafts it as one recipe. Pieces you do
not have are got along the way, and each author is paid once.

What a piece does comes from its name — start, platform, checkpoint, hazard,
moving platform, finish, or scenery for anything else; `docs/RECIPE_LIBRARY.md`
lists the words. The Roblox writer makes each piece a model named for its role
and adds one script, `bench/obby_runtime.lua`, that gives the roles their
behaviour. Drag the `.rbxmx` into Studio and press Play.

## Running it

Two processes: the crafter needs Blender and a real machine, the site does not.

```bash
python services/crafter.py            # the bench, :8000
cd web && npm install && npm run dev  # the site; Next prints the port
```

The site finds the crafter through `CRAFTER_URL` (see `web/.env.local`). Without
it the bench reports offline and shows the checked-in sample, which is what a
deployment does when the crafter's machine is asleep.

Owning a recipe takes a wallet that can sign. With `NEXT_PUBLIC_PRIVY_APP_ID`
set, a visitor signs in with an email or a Google account and Privy makes one
for them; without it, the page offers whatever extensions the browser has.

The backpack reads names and previews from a Supabase catalog. The site needs
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the agent
that writes it needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
The schema is `supabase/migrations/0001_recipes.sql`, and recipes crafted before
the catalog existed are filed with `node services/agent/backfill-catalog.mjs`. Recipes the platform offers are
published with `node services/agent/publish-stock.mjs`, which reads the list in
`out/marketplace-review/keep.txt` and sends nothing without `--publish`.

Every job is charged to the signed-in visitor's budget, so crafting needs a
sign-in. `VOXEL_USER_PAYS=off` in `.env` brings back the agent paying for
everything. On testnet a new account is sent 0.10 USDC once
(`VOXEL_TEST_CREDIT`); on mainnet people bring their own.

## Deploying

The site deploys from `web/`, not the repo root. `web/vercel.json` declares the
framework explicitly, which is not optional here: a project created without a
detected framework serves `public/` as a static site and never builds Next, so
the page 404s while the sample assets return 200 — a confusing failure worth
avoiding twice.

```bash
cd web && npx vercel deploy --prod
```

Set `CRAFTER_URL` in the Vercel project once a crafter is reachable. Without it
`/api/bench/status` reports offline, and the site says so rather than breaking.

Set `NEXT_PUBLIC_PRIVY_APP_ID` there too for email and Google sign-in. It is
read at build time, so it takes effect on the next deployment, not on a restart.
The two Supabase variables for the site belong there as well.

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

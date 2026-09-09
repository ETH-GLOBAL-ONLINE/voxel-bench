# Where we are, and what is left

Monday 7 September, end of day. Submission is **Sunday 13 at 12:00 EDT**.

If you are picking this up cold: read the top section to know what already
works, then take anything from "What is left". Each item says where to start and
what finished looks like, so you should not need to ask.

---

## What works, verified

**A sentence becomes an object in your Roblox account.** That whole line is
done, end to end, in the browser.

```bash
python services/crafter.py          # the crafter, :8000
cd web && npm run dev               # the site; Next prints the port
```

| Piece | State | Measured |
|---|---|---|
| Sentence to recipe | works | 3–48s on Gemini's free tier, median ~17s, ~2400 tokens |
| Validator | works | rejects invented shapes, missing sizes, wrong units; repairs the rest with a note |
| Blender crafts it | works | ~7s, 250–750 triangles |
| Native Roblox parts | works | exact studs, exact colours, no upload of a mesh |
| Publish to Roblox | works | `.rbxmx` accepted by Open Cloud, moderation approved in ~3s |
| The site | works | prompt, progress, preview, orbit, publish |
| Connect a Roblox account | works | key stays in the browser, never on our disk |
| Deployed | works | https://voxel-bench-psi.vercel.app |

**Where it runs.** Blender cannot run on Vercel, so the site and the crafter are
separate: the site on Vercel, the crafter on a real machine. That is the same
split x402 asks for anyway. The crafter is offline most of the time and the site
says so rather than breaking.

---

## What is left

Ordered by what unblocks the most. The first three are what the prizes actually
score, and **none of them exist yet** — the site describes the design and none
of it runs.

### 1. `Allowance` — the agent's spending cap · Track A

`RecipeBook` and `SplitVault` are **deployed on Hedera testnet and verified
against the chain**: a recipe published, three crafts settled, the 90/10 split
exact, and the book holding nothing. Nine tests pass including a fuzz over the
split.

| | |
|---|---|
| `SplitVault` | `0x95DC0868731Ea10b457d7b937217c2Ed3Da6623C` |
| `RecipeBook` | `0x58e6af2A5FEfb42d58Bd63aBc87fdA04aEddD9A5` |

What is left of the contracts is `Allowance`: the cap the crafting agent cannot
raise itself, which is the Ledger track's argument and the one place a human
signature has to be required.

### 1b. The original three-contract plan, for reference

Three small contracts on Hedera testnet. Deliberately small: three that each do
one thing beat one that does everything, especially when a judge has four
minutes to read them.

| Contract | Holds |
|---|---|
| `RecipeBook` | recipe id, author, split terms, craft count |
| `SplitVault` | what each author has earned and can withdraw |
| `Allowance` | the agent's spending cap, and the human signature to raise it |

**Start at** `docs/ONCHAIN.md` section 4, and the vocabulary table in `PLAN.md`
section 1 — the contract should use the same words the UI does, so a judge reads
the contract and recognises what they just saw on screen.

**Done looks like** a recipe registered onchain with its author, a craft
settling against it, and an author withdrawing.

### 2. ~~x402 on the three services~~ — done

Three stages, three prices, paid on Hedera testnet and confirmed on the ledger:
`+100000`, `+500000` and `+1000000` tinybars landed in the service account in
the order the agent consumed them. The transfers show the facilitator as sender
— the agent signs partially, the facilitator co-signs and covers the gas, so the
agent never needs gas of its own.

`/services` advertises what is on offer and what it costs, unpriced, because an
agent has to be able to see the menu before it can decide to pay.

What is left of this is the contract half of the cap — see item 1.

### 2b. The original plan, for reference

Each stage is already a separate service call inside `services/crafter.py`.
Putting a paywall in front of each is the change.

Prices should differ by what the stage costs us: the recipe is one model call,
crafting is seven seconds of CPU, publishing consumes an external quota. That
maps onto the product — **previewing costs cents, publishing costs more** — so
nobody pays to publish something they have not seen.

**Start at** `docs/ONCHAIN.md` section 3.1. This is the Hedera track, our first
priority, and it asks for exactly this.

**Done looks like** the orchestrator paying per call from its own wallet, no
shared secrets between stages, and a spending cap the agent cannot raise itself.

### 3. The recipe library · anyone with a 3D eye, no code needed

A curated set of good recipes does three things at once: it gives the model
better examples to imitate, it makes anything already in the library craft
instantly with no model call, and it means the marketplace has stock rather
than being an empty shelf on Sunday.

The fourth thing is worth more than the recipes: whoever builds it will find
out what the model gets wrong *systematically*, and each of those is one line
in the prompt that fixes every future craft.

**Start at** [docs/RECIPE_LIBRARY.md](RECIPE_LIBRARY.md) — the loop, the
format, what makes a recipe good, what our five primitives do badly, and a
catalogue organised as themed kits that can build whole games.

### 4. The recipe marketplace · Track B

Not a new system — it is the interface to `RecipeBook`. Publish a recipe, others
craft with it, you earn per craft.

It also fixes the latency problem, which is the interesting part: **a recipe
that already exists needs no model call at all.** It crafts instantly and its
author gets paid. Only genuinely new objects pay the model cost, so the platform
gets faster as it gets more recipes.

**Start at** `web/app/components/Bench.tsx`. The card in the "Why onchain"
section of `page.tsx` is the shape it should take, currently illustrative.

### 5. Roblox materials · Track A, cheap and high value

Every Roblox part has a `Material` property — `Wood`, `Metal`, `Slate`,
`CorrodedMetal`, `Grass`. Setting it gives real surface texture with no image,
no upload, no UV mapping. It is one more field in the recipe and it is the
biggest visible quality gain available for the effort.

**The catch:** the Blender preview will not show it, and the preview promising
something the result does not deliver breaks the design. So approximate it in
Blender too — map each material to a roughness and a little relief.

**Start at** `bench/to_rbxmx.py` (`part_xml`) and the schema in
`bench/describe.py`. Verify the enum values by asking Studio through the MCP
rather than trusting a list.

### 6. Luau scripts on objects · Track A

A crate that sits there is decoration; a crate that gives you coins when touched
is a mechanic. Generating Luau is the *easy* part of this project — it is
well-documented and, unlike geometry, it either runs or throws.

Delivery is a `.rbxmx` holding the part plus a `Script` child, which is the file
we already write.

**Untested and worth checking first:** Roblox moderates models containing
scripts. If that takes hours rather than seconds, scripts cannot be in a live
demo.

### 7. The obby · Track A — the wow, and the first thing to cut

An obby is a sequence of platforms, hazards, checkpoints and a finish, which is
spatial arrangement of objects. **An obby is a recipe of recipes.** Nothing new
to invent, just scale.

Needs `universe-places` added to the API key — editable on the existing key, no
need to regenerate.

**Cut this first if anything slips.** See `PLAN.md` section 10: the demo video is
built so that losing this shortens it rather than breaking it.

### 8. The video · Saturday, both of us

Two to four minutes, **narrated by one of us** — the rules reject AI voiceover,
text-to-speech and phone recordings. Structure and fallbacks are in `PLAN.md`
section 10.

---

## Schedule to Sunday

We are roughly a day and a half ahead of the original plan: Tuesday's job was
proving Roblox would accept anything, and that is done, along with the site that
was scheduled for Friday.

| Day | Track A | Track B |
|---|---|---|
| **Tue 8** | Contracts on Hedera testnet | Wallet connect; marketplace view |
| **Wed 9** | x402 on the three services, spending cap | Wire the marketplace to the contract |
| **Thu 10** | Materials, then Luau scripts | Polish; the recipe library view |
| **Fri 11** | The obby, if the week held | Polish |
| **Sat 12** | Freeze at midday. Record. | Same |
| **Sun 13** | Submit in the morning | — |

---

## Decisions still open

- **Which three partner prizes** to select at submission. Current order is
  Hedera, Ledger, Circle/Arc, with ENS in reserve — `PLAN.md` section 6.
- **Whether materials are worth a day** before scripts. They probably are: more
  visible improvement per hour than anything else on the list.
- **What to do about latency.** Gemini's free tier ranges 3 to 48 seconds for
  the same work. The marketplace is the real answer; Groq was measured and is
  worse (see `docs/LOG.md`).

## Things that will bite you

All of these already cost us time once. They are in `docs/LOG.md` in full.

- **A 403 from Roblox is the API key's IP allowlist**, and the message never
  says so.
- **FBX arrives 100x too large and grey.** Use the native-parts path; it exists
  for this reason.
- **A negative part size is not rejected** — Roblox clamps it to 0.001 and the
  part is there, correct colour, invisible.
- **A Roblox model without a `PrimaryPart`** borrows a pivot orientation from
  its bounding box, so moving it tilts everything.
- **Blender resolves a relative render path against its own base**, not the
  working directory, and writes your preview somewhere else entirely.
- **Never enable `VOXEL_ALLOW_SERVER_KEY` on a public bench.** It lets anyone
  who can reach the endpoint publish into the operator's Roblox account.

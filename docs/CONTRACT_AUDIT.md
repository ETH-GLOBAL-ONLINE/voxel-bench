# Contract audit — for Stefan

**Independent of everything else.** The contracts are written, deployed and
tested; nothing in the pipeline is waiting on this. Pick it up whenever it suits
alongside the recipes.

Your experience is the reason to ask. These three hold and move funds, they are
the part a judge is most likely to open, and a second reading finds things a
first one does not.

---

## What they do

Three small contracts, each with one job. That split is deliberate: three that
each do one thing read faster than one that does everything, which matters when
someone has four minutes with them.

| Contract | Job | Address (Hedera testnet) |
|---|---|---|
| `RecipeBook` | who wrote which recipe, how often it was crafted, how the fee divides | `0x333EdFE67b0e1dcEda52CA5D483B6dd54A102e1E` |
| `SplitVault` | what each author has earned until they withdraw it | `0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE` |
| `Allowance` | the crafting agent's spending money, and the ceiling on it | `0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C` |

The same contracts are on Arc testnet at different addresses — `docs/STATUS.md`
has both columns. `RecipeBook` gained `publishFor` after the first deployment,
which is why the addresses changed and why the two chains no longer match.

**The flow.** The first address to claim a recipe owns it, through `publish`
or, signed and relayed, through `publishFor`. The id is the hash of the
content, so a second claim of the same id is refused. What that does not do is
prove the first claimant wrote it: see SR-01 below. Someone crafting with a
recipe calls `craft(recipeId)` with a payment; `RecipeBook` splits it, forwards
both parts to `SplitVault` and counts the craft. The author withdraws when they
like.

Separately, the agent that runs the crafting draws its spending money from
`Allowance`, which refuses past a cap. It holds no other funds, so the ceiling
is arithmetic rather than policy.

Source is in `contracts/src/`. Everything is commented with the reasoning, so
the code should tell you why as well as what.

---

## Running it

```bash
cd contracts
npm install
npx hardhat test        # 29 tests, three of them fuzz
```

Against the live chain, which needs `HEDERA_PRIVATE_KEY` in `.env` — ask me:

```bash
node scripts/verify-live.mjs        # publish, craft, check the split
node scripts/verify-allowance.mjs   # draw within the cap, then past it
```

---

## Where a second reading pays off most

Not a list of suspicions — these are the three places where the reasoning is
densest, so they are where another perspective adds the most.

**`SplitVault.withdraw()` and the order of operations.** It zeroes the balance
before the external call, which is the intended defence. Worth confirming the
sequence holds under a recipient that calls back in, and that `totalOwed` cannot
drift out of step with the contract's actual balance.

**The window arithmetic in `Allowance`.** The window does not slide: the first
draw after one expires starts the next. That was chosen for simplicity over a
rolling sum. The question worth answering is whether an agent could time draws
around a boundary to spend more than intended in a short span, and whether that
matters at the amounts involved.

**Units.** On Hedera the relay hands the contract tinybars — 8 decimals — where
an EVM chain would hand it wei. `eth_getBalance` still answers in wei. The
contracts are decimals-agnostic, since they only ever split and compare what
they are given, but any place that assumes a scale is worth a look. This one
already caught us once and is written up in `FEEDBACK.md`.

Anything else you notice is welcome, including "this is fine". A clean read is
information too.

---

## What to do with what you find

Whichever is easier for you:

- **A PR** on `track-a/contract-audit` with fixes or comments, or
- **A message** with what you saw, and I will do the changes.

If something is worth changing but the change carries more risk than the issue,
say so and we decide together. A note in the code explaining a known trade-off
is a legitimate outcome and reads well.

---

## What is happening on the front meanwhile

So you know what to expect and what not to build on top of yet.

**Next up: the site starts paying.** Right now there are two paths that do not
meet — the site crafts for free by calling the crafter directly, and the agent
pays for the same work from a terminal. Today they become one: the browser will
show the three payments happening while the object is built.

That means `web/app/components/Bench.tsx` is going to move. If you were thinking
of touching the front, ping me first so we do not collide.

**Then ENS.** Each service gets a name — `recipe.voxelbench.eth` and so on — so
the agent finds services by resolving a name instead of reading a URL from its
configuration.

**Then the recipe marketplace**, which is where your library becomes visible:
the real recipes, their authors, how often each was crafted and what it earned,
read from `RecipeBook` rather than mocked.

That last one is the reason the library and the contracts are the same project
rather than two. The contracts are the accounting; your recipes are what there
is to account for.

---

## Findings

### SR-01: the first observer of an id can take the recipe

Found by Stefan, with a proof of concept. `publish(recipeId)` gives a recipe to
whoever calls it first, and nothing proves that caller wrote it. The id is a
hash of content that can be seen, so anyone who has seen an unclaimed id can
claim it, and every later craft pays them the author share.

The signed route has the same gap. `publishFor` checks that the signature
matches the author it is handed, and an observer can hand it their own address
with their own signature; no one else is needed. Removing `publish` alone does
not close it. `contracts/test/FrontRunPublishFor.t.sol` shows it: the observer
claims the id, and the real author's valid signature is then refused.

What made it reachable here was the catalog, which listed recipes nobody owned
yet, contents included. That is closed on the application side:

- a new recipe is filed in the catalog only once someone owns it on the chain;
- the recipes the platform offers are published under its own address, so they
  have an owner and cannot be claimed first.

The contract-level fix is in `docs/MAINNET.md`: a claim that also carries the
signature of the agent that performed the craft, so only someone who crafted a
recipe can be recorded as its author.

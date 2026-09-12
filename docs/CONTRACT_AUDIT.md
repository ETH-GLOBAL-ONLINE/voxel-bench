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
| `RecipeBook` | who wrote which recipe, how often it was crafted, how the fee divides | `0x36C6C3e991B8673c44B7216f1b0499eA19f8Df41` |
| `SplitVault` | what each author has earned until they withdraw it | `0xBaE7C31f9080733DB1Cd18Ed99b5d70fF65406DE` |
| `Allowance` | the crafting agent's spending money, and the ceiling on it | `0xB95A8CDa8AF890039a6455C1066C686E3Af7aB1C` |

The same contracts are on Arc testnet at different addresses — `docs/STATUS.md`
has both columns. `RecipeBook` has been deployed three times: it gained
`publishFor` after the first, and an attester after SR-01 below. `SplitVault`
and `Allowance` are the originals, and each new book shares the old one's
vault.

**The flow.** The agent that crafts is the book's attester, and the only
address that can record an author. The platform's own recipes it publishes
under itself, with `publish`. A person's recipe they claim by signing a
message, free, and the agent relays it with `publishFor`: the signature says
this person wants this recipe, the relay says the agent crafted it for them,
and only both together record an author. The id is the hash of the content, so
a second claim of the same id is refused. Someone crafting with a recipe calls
`craft(recipeId)` with a payment; `RecipeBook` splits it, forwards both parts
to `SplitVault` and counts the craft. The author withdraws when they like.

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
npx hardhat test        # 64 tests: unit, fuzz and stateful invariants
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

### SR-01: the first observer of an id could take the recipe — closed

Found by Stefan, with a proof of concept. `publish(recipeId)` gave a recipe to
whoever called it first, and nothing proved that caller wrote it. The id is a
hash of content that can be seen, so anyone who had seen an unclaimed id could
claim it, and every later craft would have paid them the author share.

The signed route had the same gap. `publishFor` checked that the signature
matched the author it was handed, and an observer could hand it their own
address with their own signature; no one else was needed. Removing `publish`
alone would not have closed it: a signature proves a wallet, not the work.

**What closed it.** Two layers, one on each side of the chain.

- *The agent vouches only for whoever it crafted for.* Every craft is charged
  to a signed-in person's budget, so the agent knows who did the work. It
  writes that down privately (`services/agent/crafted.mjs`, never in the
  public catalog) and relays a claim only for that person: anyone else is
  refused whatever they signed. A recipe not claimed on the spot waits under
  *Unclaimed* in the backpack, where only its crafter can claim it.
- *The contract records an author only from the agent.* `RecipeBook` has an
  `attester`, set to the agent, and `publish` and `publishFor` revert with
  `NotAttester` from any other address. The author's signature is still
  required, so the agent cannot misname an author either, and the owner can
  rotate the attester. This is the provenance the finding asked for — the
  trusted service's word on `(recipeId, author)` — carried by the relayer
  rather than by a second signature, which keeps the ABI and the person's part
  of the claim as they were.

The books were deployed again on both chains against the existing vaults, so
nothing anyone had earned moved. The old books' recipes were carried over with
`migrate`, checked one by one against the old books, and the migration was
sealed for good (`contracts/scripts/migrate-book.mjs`).

**Tests.** `contracts/test/FrontRunPublishFor.t.sol`, which showed the capture
working, now shows it failing: the observer's self-signed claim and their
direct `publish` both revert, and the real author's claim, relayed by the
attester, goes through. The audit's regression, invariant and stateless suites
are in `contracts/test/`, and its write-up under `contracts/audit/`.

The application-side mitigations from before stay: a new recipe is filed in
the catalog only once someone owns it on the chain, and the platform's recipes
are published under its own address.

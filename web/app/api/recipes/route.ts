// What RecipeBook holds, read from the chain by the site itself.
//
// This used to go through the agent, which meant a deployment saw an empty
// marketplace whenever the bench was offline — most of the time. The contracts
// are public, so the site reads them, and the shelf is stocked whether or not
// anybody's laptop is awake.

import { acrossChains, publishedOn, type LedgerName } from "../chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("chain") as LedgerName | null;

  try {
    const ledgers = asked
      ? [await publishedOn(asked)]
      : await acrossChains(publishedOn);

    // One shelf, with each recipe carrying the chain it was published on.
    const recipes = ledgers.flatMap((l) =>
      l.recipes.map((r) => ({ ...r, chain: l.chain, explorer: l.explorer })),
    );

    return Response.json({
      chains: ledgers.map((l) => ({ chain: l.chain, book: l.book, explorer: l.explorer })),
      recipes,
    });
  } catch {
    return Response.json(
      { recipes: [], reason: "could not reach the chain" },
      { status: 503 },
    );
  }
}

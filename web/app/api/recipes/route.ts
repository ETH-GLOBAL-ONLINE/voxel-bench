// What RecipeBook holds, for the marketplace to show.
//
// The card used to be illustrative. Now it reads the chain: which recipes are
// published, who wrote them, how often each was crafted and what that earned.
// Nobody has to take our word for any of it — the addresses are in the answer
// and the same numbers are readable from any node.

import { bench, reason } from "../bench";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const target = bench();
  if (!target) {
    return Response.json({ recipes: [], reason: "nothing is configured" });
  }

  const chain = new URL(req.url).searchParams.get("chain");

  try {
    const res = await fetch(
      new URL(`/recipes${chain ? `?chain=${chain}` : ""}`, target.base),
      { cache: "no-store", signal: AbortSignal.timeout(30000) },
    );
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { recipes: [], reason: reason(data, "the ledger did not answer") },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    // A marketplace that cannot reach the chain should say so rather than
    // show an empty shelf as though nothing had ever been published.
    return Response.json(
      { recipes: [], reason: "could not reach the chain" },
      { status: 503 },
    );
  }
}

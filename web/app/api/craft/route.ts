// Starting a craft has to return immediately. The work takes twenty to sixty
// seconds and a Vercel function gets ten, so this hands the prompt over, gets a
// job id back, and lets the browser poll.
//
// What it hands the prompt to is the agent, which pays for each stage before
// asking for it. See ../bench.ts for the fallback when no agent is configured.

import { bench, OFFLINE, reason } from "../bench";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const target = bench();
  if (!target) return Response.json(OFFLINE, { status: 503 });

  let prompt: unknown;
  let recipeId: unknown;
  let collector: unknown;
  try {
    ({ prompt, recipeId, collector } = await req.json());
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }

  // A recipe from the marketplace is asked for by its id; a new one by a
  // sentence. The agent checks both.
  const fromMarketplace = typeof recipeId === "string" && /^0x[0-9a-fA-F]{64}$/.test(recipeId);

  if (!fromMarketplace && (typeof prompt !== "string" || prompt.trim().length < 3)) {
    return Response.json(
      { error: "Say a little more about what you want." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(new URL("/craft", target.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        fromMarketplace
          ? {
              recipeId,
              collector: typeof collector === "string" ? collector : undefined,
            }
          : { prompt: (prompt as string).trim().slice(0, 280) },
      ),
      // The agent reads the price list before it answers, so give it a little
      // longer than the crafter needed just to accept a job.
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: reason(data, "the bench refused") },
        { status: res.status },
      );
    }
    return Response.json({ ...data, paid: target.paid });
  } catch {
    return Response.json(
      { error: "The bench did not answer. It may be offline." },
      { status: 503 },
    );
  }
}

// What the agent may still spend, read from the chain by the site itself.
//
// The cap is one of the three reasons this project is onchain, and it was the
// only one a visitor could not see. Reading it here rather than through the
// agent means it is visible on a deployment, which is where it matters: a limit
// nobody can check has the same shape as a promise.

import { acrossChains, capOn } from "../chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return Response.json({ caps: await acrossChains(capOn) });
  } catch {
    return Response.json({ caps: [], error: "could not reach the chain" }, { status: 503 });
  }
}

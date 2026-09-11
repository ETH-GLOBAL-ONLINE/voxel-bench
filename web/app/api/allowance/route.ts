// What the agent may still spend in this window.
//
// The cap is one of the three reasons this project is onchain, and until now it
// was the only one a visitor could not see. A limit nobody can check is the
// same shape as a promise, which is the thing it exists to not be.

import { bench, reason } from "../bench";

export const dynamic = "force-dynamic";

export async function GET() {
  const target = bench();
  if (!target) return Response.json({ disabled: true });

  try {
    const res = await fetch(new URL("/allowance", target.base), {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: reason(data, "could not read the cap") }, { status: res.status });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "could not reach the chain" }, { status: 503 });
  }
}

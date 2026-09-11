// Claiming a recipe: the browser asks what to sign, signs it, and sends the
// signature back. We relay it and pay the gas; the recipe belongs to the signer.

import { bench, OFFLINE, reason } from "../bench";

export const dynamic = "force-dynamic";

// The typed data to sign, built from the deployment rather than from anything
// the page knows about contracts.
export async function GET(req: Request) {
  const target = bench();
  if (!target) return Response.json(OFFLINE, { status: 503 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const author = url.searchParams.get("author") ?? "";

  try {
    const res = await fetch(
      new URL(`/claim/${id}?author=${author}`, target.base),
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: reason(data, "bad claim") }, { status: res.status });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "The bench did not answer." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const target = bench();
  if (!target) return Response.json(OFFLINE, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }

  try {
    const res = await fetch(new URL("/claim", target.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Publishing is a transaction and a wait for its receipt.
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: reason(data, "the claim was refused") },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "The bench did not answer." }, { status: 503 });
  }
}

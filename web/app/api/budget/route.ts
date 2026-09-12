// A person's budget for their agent.
//
// Reading it goes to the chain directly, so it shows with the bench switched
// off. Changing it goes through the agent: it builds what to sign, and relays
// the signed permit, paying the gas. So does the one-off test credit.

import { bench, OFFLINE, reason } from "../bench";
import { budgetOf } from "../chain";

export const dynamic = "force-dynamic";

const isAddress = (v: unknown): v is `0x${string}` =>
  typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!isAddress(owner)) return Response.json({ error: "bad address" }, { status: 400 });
  try {
    return Response.json(await budgetOf(owner));
  } catch {
    return Response.json({ error: "Could not read Arc just now." }, { status: 503 });
  }
}

// What the page asks for, and where on the agent it goes.
const STEPS: Record<string, string> = {
  typed: "/budget/typed",
  permit: "/budget/permit",
  credit: "/budget/credit",
};

export async function POST(req: Request) {
  const target = bench();
  if (!target) return Response.json(OFFLINE, { status: 503 });

  let body: { step?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }

  const path = STEPS[body.step ?? ""];
  if (!path) return Response.json({ error: "unknown step" }, { status: 400 });
  if (!isAddress(body.owner)) return Response.json({ error: "bad address" }, { status: 400 });

  try {
    const { step: _step, ...rest } = body;
    const res = await fetch(new URL(path, target.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rest),
      // Relaying a permit or sending a credit is a transaction and a wait.
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: reason(data, "the bench refused") }, { status: res.status });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "The bench did not answer." }, { status: 503 });
  }
}

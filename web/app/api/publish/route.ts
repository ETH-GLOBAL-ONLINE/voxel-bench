// Publishing runs as a job like crafting and reports through the same status
// endpoint — the upload is quick but moderation is Roblox's clock, not ours.
//
// The Roblox key belongs to whoever is publishing. It arrives with the request,
// is passed through once, and is never logged or stored on the way.

import { bench, OFFLINE, reason } from "../bench";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const target = bench();
  if (!target) return Response.json(OFFLINE, { status: 503 });

  let name: unknown;
  let apiKey: unknown;
  let userId: unknown;
  try {
    ({ name, apiKey, userId } = await req.json());
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }

  if (typeof name !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(name)) {
    return Response.json({ error: "bad name" }, { status: 400 });
  }

  try {
    const res = await fetch(new URL("/publish", target.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        api_key: typeof apiKey === "string" ? apiKey : undefined,
        user_id: typeof userId === "string" ? userId : undefined,
      }),
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
    return Response.json({ error: "The bench did not answer." }, { status: 503 });
  }
}

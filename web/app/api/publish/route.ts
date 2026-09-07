// Publishing runs as a job like crafting, and reports through the same status
// endpoint — the upload is quick but moderation is Roblox's clock, not ours.

export const dynamic = "force-dynamic";

const CRAFTER_URL = process.env.CRAFTER_URL;

export async function POST(req: Request) {
  if (!CRAFTER_URL) {
    return Response.json(
      { error: "The bench is offline — nothing can be published." },
      { status: 503 },
    );
  }

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
    const res = await fetch(new URL("/publish", CRAFTER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Passed through, never logged and never stored on the way.
      body: JSON.stringify({
        name,
        api_key: typeof apiKey === "string" ? apiKey : undefined,
        user_id: typeof userId === "string" ? userId : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    // FastAPI puts its refusals in `detail`; the browser reads `error`.
    if (!res.ok) {
      return Response.json(
        { error: data.detail ?? data.error ?? "the bench refused" },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "The bench did not answer." },
      { status: 503 },
    );
  }
}

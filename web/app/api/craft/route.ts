// Starting a craft has to return immediately. The work takes twenty to sixty
// seconds and a Vercel function gets ten, so this hands the prompt to the
// crafter, gets a job id back, and lets the browser poll.

export const dynamic = "force-dynamic";

const CRAFTER_URL = process.env.CRAFTER_URL;

export async function POST(req: Request) {
  if (!CRAFTER_URL) {
    return Response.json(
      { error: "The bench is offline — no crafter is configured." },
      { status: 503 },
    );
  }

  let prompt: unknown;
  try {
    ({ prompt } = await req.json());
  } catch {
    return Response.json({ error: "expected JSON" }, { status: 400 });
  }

  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return Response.json(
      { error: "Say a little more about what you want." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(new URL("/craft", CRAFTER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim().slice(0, 280) }),
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { error: "The bench did not answer. It may be offline." },
      { status: 503 },
    );
  }
}

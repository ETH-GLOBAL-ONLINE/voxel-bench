// Polled every couple of seconds while a craft runs, so it stays cheap and
// never holds a function open waiting for Blender.

export const dynamic = "force-dynamic";

const CRAFTER_URL = process.env.CRAFTER_URL;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;

  if (!CRAFTER_URL) {
    return Response.json({ status: "failed", error: "no crafter configured" });
  }
  if (!/^[a-f0-9]{6,32}$/.test(job)) {
    return Response.json({ status: "failed", error: "bad job id" }, { status: 400 });
  }

  try {
    const res = await fetch(new URL(`/craft/${job}`, CRAFTER_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { status: "failed", error: "lost contact with the bench" },
      { status: 503 },
    );
  }
}

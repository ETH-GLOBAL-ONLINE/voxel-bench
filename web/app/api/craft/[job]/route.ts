// Polled every couple of seconds while a craft runs, so it stays cheap and
// never holds a function open waiting for Blender.
//
// The answer carries a `payments` array when the agent is the backend: the
// stages, their prices, and how far each one has got. That is the part the
// browser renders while it waits.

import { bench, reason } from "../../bench";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;
  const target = bench();

  if (!target) {
    return Response.json({ status: "failed", error: "nothing is configured to craft" });
  }
  if (!/^[a-f0-9]{6,32}$/.test(job)) {
    return Response.json({ status: "failed", error: "bad job id" }, { status: 400 });
  }

  try {
    const res = await fetch(new URL(`/craft/${job}`, target.base), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { status: "failed", error: reason(data, "the bench refused") },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { status: "failed", error: "lost contact with the bench" },
      { status: 503 },
    );
  }
}

// Blender cannot run on Vercel — serverless has no room for a 500 MB binary and
// no persistent machine to run it on. The crafter therefore lives somewhere
// else, and "somewhere else" is frequently a laptop that is closed.
//
// This tells the site which it is, so a closed laptop reads as "the bench is
// offline" rather than as a broken site. It also reports whether the bench
// behind it is the paying agent, so the page can say what it actually does
// instead of promising payments that are not happening.

import { bench } from "../../bench";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 2500;

export async function GET() {
  const target = bench();
  if (!target) {
    return Response.json({ online: false, paid: false, reason: "nothing configured" });
  }

  try {
    const res = await fetch(new URL("/health", target.base), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ online: false, paid: target.paid });

    const health = await res.json();
    // The agent answers for the whole chain behind it. It being up while the
    // crafter is down is still an offline bench, and saying otherwise would
    // send someone into a craft that cannot finish.
    const online = target.paid ? Boolean(health.crafter && health.paywall) : true;
    return Response.json({
      online,
      paid: target.paid,
      agent: health.agent ?? null,
    });
  } catch {
    return Response.json({ online: false, paid: target.paid, reason: "unreachable" });
  }
}

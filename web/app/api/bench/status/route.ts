// Blender cannot run on Vercel — serverless has no room for a 500 MB binary and
// no persistent machine to run it on. The crafter therefore lives somewhere
// else, and "somewhere else" is frequently a laptop that is closed.
//
// This tells the site which it is, so a closed laptop reads as "the bench is
// offline" rather than as a broken site.

export const dynamic = "force-dynamic";

const CRAFTER_URL = process.env.CRAFTER_URL;
const TIMEOUT_MS = 2500;

export async function GET() {
  if (!CRAFTER_URL) {
    return Response.json({
      online: false,
      reason: "no crafter configured",
    });
  }

  try {
    const res = await fetch(new URL("/health", CRAFTER_URL), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return Response.json({ online: res.ok });
  } catch {
    return Response.json({ online: false, reason: "crafter unreachable" });
  }
}

import { readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

// The crafter writes to <repo>/out. Next only serves from public/, so this
// hands those files to the browser without us having to copy them on every
// craft.
const OUT_DIR = resolve(process.cwd(), "..", "out");

// out/ lives outside the Next app, so it exists in local development and never
// in a deployment: Vercel only bundles what is inside web/. When it is missing
// we hand the request to public/samples/, which the CDN serves. That is why the
// checked-in sample lives under public/ rather than at the repo root.
const SAMPLE_URL = "/samples";

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "model/fbx",
  ".png": "image/png",
  ".json": "application/json",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  const rel = normalize(path.join("/"));
  const ext = rel.slice(rel.lastIndexOf("."));

  // Never let a request climb out of out/.
  const target = resolve(join(OUT_DIR, rel));
  if (!target.startsWith(OUT_DIR)) return new Response("no", { status: 403 });

  try {
    const body = await readFile(target);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: { location: `${SAMPLE_URL}/${rel}` },
    });
  }
}

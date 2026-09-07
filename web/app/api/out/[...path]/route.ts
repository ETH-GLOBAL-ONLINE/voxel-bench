import { readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

// The crafter writes to <repo>/out. Next only serves from public/, so this
// hands those files to the browser without us having to copy them on every
// craft.
const OUT_DIR = resolve(process.cwd(), "..", "out");

// out/ is generated and gitignored, so a fresh clone has nothing in it. A
// checked-in sample means the bench is populated for anyone who has not run
// Blender — which is everyone looking at this repo for the first time.
const SAMPLE_DIR = resolve(process.cwd(), "..", "samples");

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

  for (const dir of [OUT_DIR, SAMPLE_DIR]) {
    // Never let a request climb out of the directory we are serving.
    const target = resolve(join(dir, rel));
    if (!target.startsWith(dir)) return new Response("no", { status: 403 });

    try {
      const body = await readFile(target);
      return new Response(new Uint8Array(body), {
        headers: {
          "content-type": TYPES[ext] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    } catch {
      // fall through to the sample
    }
  }

  return new Response("not crafted yet", { status: 404 });
}

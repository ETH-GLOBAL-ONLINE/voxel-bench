// Reads the repo's .env into process.env.
//
// Node can do this itself with --env-file, but then the documented way to start
// a service is a flag someone has to remember and the service fails confusingly
// without it. A service that needs an account id should find it, so this is
// imported rather than required at the command line.
//
// Nothing already set in the environment is overwritten: a real deployment sets
// real variables, and a file on a laptop should not win against them.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv(path = resolve(ROOT, ".env")) {
  let text;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return; // no .env is fine if the environment is already set
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!(key.trim() in process.env)) process.env[key.trim()] = rest.join("=").trim();
  }
}

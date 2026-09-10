// Where the site sends work, and whether that costs anything.
//
// Two backends answer the same job-and-poll shape. `AGENT_URL` is the agent,
// which pays for each stage out of its own wallet before asking for it, and
// reports what it paid. `CRAFTER_URL` is the crafter on its own, which does the
// work for nothing.
//
// The agent is the real story and the deployment points at it. The direct route
// stays because running the bench should not require a funded wallet — anyone
// cloning this can craft without holding HBAR, and the site says which one it is
// rather than quietly implying a payment that never happened.

const AGENT_URL = process.env.AGENT_URL;
const CRAFTER_URL = process.env.CRAFTER_URL;

export type Bench = { base: string; paid: boolean };

export function bench(): Bench | null {
  if (AGENT_URL) return { base: AGENT_URL, paid: true };
  if (CRAFTER_URL) return { base: CRAFTER_URL, paid: false };
  return null;
}

export const OFFLINE = {
  error: "The bench is offline — nothing is configured to craft.",
};

/** The two backends disagree on how a refusal is spelled: FastAPI says
 *  `detail`, the agent says `error`. The browser only reads `error`. */
export function reason(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    for (const key of ["error", "detail"]) {
      if (typeof body[key] === "string") return body[key] as string;
    }
  }
  return fallback;
}

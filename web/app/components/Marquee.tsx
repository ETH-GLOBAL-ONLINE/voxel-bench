// A ticker under the hero: what the bench does, moving.
//
// CSS only — a track holding the list twice, sliding by half its width, so
// the seam is never seen. Each item carries its own trailing space, which is
// what keeps the two halves exactly equal. It pauses under the pointer and
// stands still when reduced motion is asked for; screen readers get the list
// once, as text.

const ITEMS = [
  "Your agent pays each stage from your budget",
  "x402 on Hedera",
  "Circle Nanopayments on Arc",
  "Prices read from ENS names",
  "Authors earn 90% of every craft",
  "Playable obbies, built from recipes",
  "No gas for you, ever",
];

export default function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-bench-700 bg-bench-900 py-3.5">
      <div className="marquee flex w-max" aria-hidden>
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <span key={i} className="label flex items-center whitespace-nowrap pr-10 !text-amber">
            {item}
            <span className="pl-10 text-bench-600">◆</span>
          </span>
        ))}
      </div>
      <p className="sr-only">{ITEMS.join(". ")}.</p>
    </div>
  );
}

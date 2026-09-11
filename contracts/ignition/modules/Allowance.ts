import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// The agent's spending money and its ceiling. Deployed apart from the recipe
// contracts because it answers a different question: RecipeBook is about who
// gets paid, this is about how much the agent may spend before a human is
// asked.
//
// Amounts here are what the contract sees, and the two chains disagree about
// that. On Hedera the relay hands a contract tinybars, so one HBAR is 1e8
// inside while the value used to fund it is quoted in wei. On Arc the native
// token is USDC at 18 decimals and the two agree.
//
// The amounts are not parameters. A parameters file is JSON, JSON has no
// bigint, and 1e18 is past what a JSON number holds exactly — and a helper that
// converts a string cannot work either, because getParameter returns a future
// rather than a value, so every conversion silently takes the fallback. That
// is how Arc ended up deployed with Hedera's cap, eight orders of magnitude too
// small, until setCap fixed it.
//
// The chain is named instead, and its own numbers are used.
const SETTINGS = {
  hedera: { cap: 100_000_000n, funding: 5n * 10n ** 18n }, // tinybars; 5 HBAR
  arc: { cap: 10n ** 18n, funding: 5n * 10n ** 18n },      // native USDC
} as const;

export default buildModule("VoxelBenchAllowance", (m) => {
  const agent = m.getParameter("agent");
  const chain = (process.env.ALLOWANCE_CHAIN ?? "hedera") as keyof typeof SETTINGS;
  const { cap, funding } = SETTINGS[chain] ?? SETTINGS.hedera;

  const allowance = m.contract("Allowance", [agent, cap, 86_400n], {
    value: funding,
  });

  return { allowance };
});

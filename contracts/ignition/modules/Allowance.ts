import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// The agent's spending money and its ceiling. Deployed apart from the recipe
// contracts because it answers a different question: RecipeBook is about who
// gets paid, this is about how much the agent may spend before a human is
// asked.
//
// Amounts here are what the contract sees. On Hedera that is tinybars — the
// relay converts on the way in — so one HBAR is 1e8 inside the contract while
// the value sent to fund it is quoted in wei.
export default buildModule("VoxelBenchAllowance", (m) => {
  const agent = m.getParameter("agent");
  const cap = m.getParameter("cap", 100_000_000n);        // 1 HBAR per window
  const window = m.getParameter("window", 86_400n);       // one day
  const funding = m.getParameter("funding", 5n * 10n ** 18n); // 5 HBAR

  const allowance = m.contract("Allowance", [agent, cap, window], {
    value: funding,
  });

  return { allowance };
});

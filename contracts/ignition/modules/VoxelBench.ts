import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// SplitVault first: RecipeBook takes its address in the constructor and never
// changes it, so the vault holding the money cannot be swapped out later.
export default buildModule("VoxelBench", (m) => {
  const platformBps = m.getParameter("platformBps", 1000); // 10%

  const vault = m.contract("SplitVault");
  const book = m.contract("RecipeBook", [vault, platformBps]);

  return { vault, book };
});

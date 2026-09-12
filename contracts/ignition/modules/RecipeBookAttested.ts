import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// A new RecipeBook against a SplitVault that already exists.
//
// The book gained an attester (SR-01 in docs/CONTRACT_AUDIT.md) and had to be
// deployed again; the vault did not change and holds what authors have earned,
// so the new book is pointed at it rather than at a fresh one. The vault's
// credit is open, which is what makes the two books able to share it.
//
//   npx hardhat ignition deploy ignition/modules/RecipeBookAttested.ts \
//     --network hederaTestnet --deployment-id attested-hedera \
//     --parameters ignition/params/attested-hedera.json
export default buildModule("RecipeBookAttested", (m) => {
  const vault = m.getParameter("vault");
  const platformBps = m.getParameter("platformBps", 1000); // 10%

  const book = m.contract("RecipeBook", [vault, platformBps]);

  return { book };
});

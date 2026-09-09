import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

// Hedera speaks EVM through a JSON-RPC relay rather than natively; hashio is
// the public one. The key is read from the environment so it never reaches a
// file that could be committed.
const hederaKey = process.env.HEDERA_PRIVATE_KEY;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "src",
    tests: { solidity: "test" },
  },
  networks: {
    hederaTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: hederaKey ? [hederaKey] : [],
    },
  },
};

export default config;

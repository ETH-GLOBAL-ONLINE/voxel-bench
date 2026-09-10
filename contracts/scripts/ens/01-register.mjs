// Registers the parent name on the ENSv2 beta.
//
//   node scripts/ens/01-register.mjs
//
// The subregistry and resolver are left empty here and set in the next two
// steps. Registration and delegation are separate on purpose: the name is a
// thing you own, and what answers for its children is a decision you make
// afterwards and can change.
//
// There is a commit-reveal in the middle, which is why this takes a minute.
// Committing a hash first means nobody watching the mempool can register the
// name you just asked the price of.
import { randomBytes } from "node:crypto";

import { parseAbi, toHex, zeroAddress } from "viem";

import {
  clients,
  ENS,
  erc20Abi,
  loadEnv,
  PARENT,
  registrarAbi,
  send,
} from "./ens.mjs";

loadEnv();

const YEAR = 365n * 24n * 60n * 60n;

// Read rather than assumed: the window is an immutable on the deployment, and
// a number copied from documentation is a number that can be wrong here.
const ageAbi = parseAbi([
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
]);

const { account, publicClient, wallet } = clients();

const read = (address, abi, functionName, args) =>
  publicClient.readContract({ address, abi, functionName, args });

async function main() {
  console.log(`\n  registering ${PARENT}.eth as ${account.address}\n`);

  if (!(await read(ENS.ethRegistrar, registrarAbi, "isAvailable", [PARENT]))) {
    console.log(`  ${PARENT}.eth is already taken. Nothing to do.`);
    return;
  }

  const [base, premium] = await read(ENS.ethRegistrar, registrarAbi,
    "getRegisterPrice", [PARENT, YEAR, ENS.mockUsdc]);
  const price = base + premium;
  console.log(`  price     ${Number(price) / 1e6} USDC for a year`);

  // MockUSDC's mint has no access control, which is the point of a test token.
  // Minting comfortably more than the price so a re-run does not need a second
  // trip here.
  const balance = await read(ENS.mockUsdc, erc20Abi, "balanceOf", [account.address]);
  if (balance < price) {
    await send(publicClient, await wallet.writeContract({
      address: ENS.mockUsdc, abi: erc20Abi, functionName: "mint",
      args: [account.address, 100_000_000n],
    }), "minted 100 MockUSDC");
  }

  const allowance = await read(ENS.mockUsdc, erc20Abi, "allowance",
    [account.address, ENS.ethRegistrar]);
  if (allowance < price) {
    await send(publicClient, await wallet.writeContract({
      address: ENS.mockUsdc, abi: erc20Abi, functionName: "approve",
      args: [ENS.ethRegistrar, 100_000_000n],
    }), "approved the registrar");
  }

  // The secret is what makes the commitment unguessable, and it has to survive
  // until the reveal — so it is generated once and used twice, never re-rolled.
  const secret = toHex(randomBytes(32));

  const commitment = await read(ENS.ethRegistrar, registrarAbi, "makeCommitment",
    [PARENT, account.address, secret, zeroAddress, zeroAddress, YEAR, "0x" + "0".repeat(64)]);

  await send(publicClient, await wallet.writeContract({
    address: ENS.ethRegistrar, abi: registrarAbi, functionName: "commit",
    args: [commitment],
  }), "committed");

  // Wait on the chain's clock, not ours. Sepolia's head runs a few seconds
  // behind wall time, and the first attempt at this reverted with
  // CommitmentTooNew: the gas estimate is simulated against the latest block,
  // whose timestamp had not caught up to sixty seconds of our own waiting.
  const minAge = await read(ENS.ethRegistrar, ageAbi, "MIN_COMMITMENT_AGE", []);
  const committedAt = await read(ENS.ethRegistrar, ageAbi, "commitmentAt", [commitment]);
  const readyAt = committedAt + minAge + 5n;

  console.log(`\n  matures at ${readyAt}, by the chain's clock`);
  for (;;) {
    const { timestamp } = await publicClient.getBlock();
    if (timestamp >= readyAt) break;
    process.stdout.write(`\r  waiting... ${readyAt - timestamp}s to go   `);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("\r  the commitment has aged        \n");

  await send(publicClient, await wallet.writeContract({
    address: ENS.ethRegistrar, abi: registrarAbi, functionName: "register",
    args: [PARENT, account.address, secret, zeroAddress, zeroAddress, YEAR,
           ENS.mockUsdc, "0x" + "0".repeat(64)],
  }), "registered");

  const stillFree = await read(ENS.ethRegistrar, registrarAbi, "isAvailable", [PARENT]);
  console.log(`\n  ${PARENT}.eth available: ${stillFree}  (false means it is ours)\n`);
}

main().catch((err) => {
  console.error(`\n  ${err.shortMessage ?? err.message}\n`);
  process.exit(1);
});

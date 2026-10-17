/**
 * Deploy the two contracts to a test network.
 *
 * YOU RUN THIS, NOT ME. The deployer private key never comes into a conversation, into
 * this repository, or into anything I execute. It is read from an environment variable in
 * your own shell, used to sign two transactions, and is never printed, logged, or written
 * anywhere. The script cannot be coaxed into revealing it.
 *
 *   set CHAIN_DEPLOYER_PRIVATE_KEY=0x...
 *   set CHAIN_RPC_URL=https://sepolia.base.org
 *   node deploy.mjs
 *
 * What it prints is public and safe to share: contract addresses and transaction hashes.
 */
import { JsonRpcProvider, Wallet, ContractFactory, formatEther } from 'ethers';
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RPC = process.env.CHAIN_RPC_URL || 'https://sepolia.base.org';
const KEY = process.env.CHAIN_DEPLOYER_PRIVATE_KEY;

// Refuse to continue without both, rather than falling back to a default key or a
// mainnet endpoint. A deploy aimed at the wrong chain is expensive to undo.
if (!KEY) {
  console.error('  CHAIN_DEPLOYER_PRIVATE_KEY is not set.');
  console.error('  Set it in your own shell. Do not paste it into a chat, a form, or a commit.');
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error('  CHAIN_DEPLOYER_PRIVATE_KEY does not look like a 32-byte hex key.');
  process.exit(1);
}

function findImports(path) {
  try {
    const abs = path.startsWith('@') ? require.resolve(path) : resolve(here, path);
    return { contents: readFileSync(abs, 'utf8') };
  } catch (e) {
    return { error: `not found: ${path} (${e.message})` };
  }
}

const targets = ['LearnovizeCredentials.sol', 'LearnovizePoints.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(targets.map((f) => [f, { content: readFileSync(resolve(here, f), 'utf8') }])),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const compiled = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (compiled.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(`  ${e.formattedMessage ?? e.message}`);
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const network = await provider.getNetwork();
const wallet = new Wallet(KEY, provider);

console.log(`  network   chainId ${network.chainId}  ${RPC}`);
console.log(`  deployer  ${wallet.address}`);
const bal = await provider.getBalance(wallet.address);
console.log(`  balance   ${formatEther(bal)} ETH`);
if (bal === 0n) {
  console.error('\n  Balance is zero. Fund this address from a Base Sepolia faucet first:');
  console.error('  https://portal.cdp.coinbase.com/products/faucet');
  process.exit(1);
}

// Both contracts are owned by the deployer. That is correct for testing; before mainnet
// the owner should be a multisig, because the owner is the only address that can mint a
// credential or reverse a revocation.
const out = {};

for (const [file, name] of [['LearnovizePoints.sol', 'LearnovizePoints'], ['LearnovizeCredentials.sol', 'LearnovizeCredentials']]) {
  const c = compiled.contracts[file][name];
  const factory = new ContractFactory(c.abi, '0x' + c.evm.bytecode.object, wallet);
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  const addr = await contract.getAddress();
  await contract.waitForDeployment();
  out[name] = addr;
  console.log(`\n  ${name}`);
  console.log(`    address  ${addr}`);
  console.log(`    tx       ${tx.hash}`);
  console.log(`    owner    ${wallet.address}`);
}

console.log('\n  deployed. to use these, set:');
console.log(`    CHAIN_CREDENTIALS_CONTRACT=${out.LearnovizeCredentials}`);
console.log(`    CHAIN_POINTS_CONTRACT=${out.LearnovizePoints}`);

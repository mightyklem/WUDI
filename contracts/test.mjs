/**
 * The contract tests, run against a real EVM rather than asserted about.
 *
 * These exist because of what the design is for. A credential that can be transferred is
 * not a credential, and revoke stops being enforceable once someone holds it. Those are
 * the properties everything else is built on, so they are the properties tested first and
 * tested hardest.
 *
 * Runs on an in-process chain, so it needs no wallet, no faucet and no network.
 *
 *   node test.mjs
 */
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ganache from 'ganache';
import { JsonRpcProvider, ContractFactory } from 'ethers';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Addresses from eth_accounts are lowercase; anything returned by a contract call is
 *  checksummed. Comparing them with === fails on a value that is demonstrably correct. */
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`    ok    ${name}`);
  } else {
    fail += 1;
    console.log(`    FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

function findImports(path) {
  try {
    const abs = path.startsWith('@') ? require.resolve(path) : resolve(here, path);
    return { contents: readFileSync(abs, 'utf8') };
  } catch (e) {
    return { error: `not found: ${path}` };
  }
}

// A reverting call is the expected outcome for most of these, so the raw ethers error --
// which embeds the entire transaction and sometimes thousands of characters of calldata
// -- is reduced to its reason. Otherwise one failed assertion buries the rest of the run.
function reason(e) {
  const raw = String(e?.reason ?? e?.shortMessage ?? e?.message ?? e);
  return raw.replace(/0x[0-9a-f]{40,}/gi, '<tx>').slice(0, 160);
}

async function mustRevert(name, fn) {
  try {
    const r = await fn();
    // ethers resolves a write as soon as the transaction is *submitted*. The revert only
    // surfaces on the receipt, so without this the assertion reports success for a call
    // that reverted -- which is precisely the failure this suite exists to catch. Ganache's
    // estimateGas happens to throw for some of these and not others, which makes the
    // inconsistency look like a contract fault rather than a test fault.
    if (r && typeof r.wait === 'function') await r.wait();
    check(name, false, 'it succeeded, which is the bug this exists to prevent');
    return null;
  } catch (e) {
    // The pass has to be recorded here. Returning without it meant every assertion that
    // behaved correctly printed nothing, and the run reported 23 passes for a suite with
    // well over thirty assertions -- a green result that had quietly stopped counting.
    check(name, true);
    return e;
  }
}

const targets = ['LearnovizeCredentials.sol', 'LearnovizePoints.sol'];
const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources: Object.fromEntries(targets.map((f) => [f, { content: readFileSync(resolve(here, f), 'utf8') }])),
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
    }),
    { import: findImports },
  ),
);
const errors = (compiled.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage ?? e.message);
  process.exit(1);
}

const server = ganache.server({
  wallet: { totalAccounts: 3, defaultBalance: 1000 },
  logging: { quiet: true },
  chain: { networkId: 1337, chainId: 1337, hardfork: 'shanghai' },
});
await server.listen(8547);
const provider = new JsonRpcProvider('http://127.0.0.1:8547', undefined, { staticNetwork: true });

// Ganache's own accounts, asked for rather than derived. Passing wallet.mnemonic does not
// make ganache use it -- it keeps its built-in keys -- so deriving signers from a phrase
// produces signers that exist nowhere on the chain and fail the first deploy with a gas
// error. Reading eth_accounts is the only way to get addresses that are actually funded.
const accounts = await provider.send('eth_accounts', []);
const owner = await provider.getSigner(accounts[0]);
const learner = await provider.getSigner(accounts[1]);
const stranger = await provider.getSigner(accounts[2]);
const learnerAddr = accounts[1];

async function deploy(file, name, args) {
  const c = compiled.contracts[file][name];
  const f = new ContractFactory(c.abi, '0x' + c.evm.bytecode.object, owner);
  const inst = await f.deploy(...args);
  await inst.waitForDeployment();
  return inst;
}

const HASH = '0x' + 'ab'.repeat(32);
const HASH2 = '0x' + 'cd'.repeat(32);
const REASON = '0x' + 'ef'.repeat(32);

console.log('\n  LearnovizeCredentials');
const creds = await deploy('LearnovizeCredentials.sol', 'LearnovizeCredentials', [await owner.getAddress()]);

// Real accounts for every role. Literal addresses like 0x1111... have no signer behind
// them, so anything that needs to be *sent* by the holder -- approving an operator, for
// one -- cannot be exercised at all.
// Addresses and signers are kept apart on purpose. Assigning an address string over a
// signer variable looks correct and produces a contract whose runner cannot send a
// transaction -- ethers reports that as "contract runner does not support sending
// transactions", which says nothing about the contract under test.
const holderAddr = accounts[0];
const attackerAddr = accounts[1];
const recipientAddr = accounts[2];
const holderSigner = await provider.getSigner(holderAddr);
const attackerSigner = await provider.getSigner(attackerAddr);

await creds.issue(holderAddr, 1, HASH, 'LEARNOVIZE-2026-TEST01', HASH2);
check('issues to a holder', same(await creds.holderOf(1), holderAddr));
check('stores the certificate hash', (await creds.get(1))[0] === HASH);
check('starts not revoked', (await creds.isRevoked(1)) === false);

console.log('\n    non-transferability');
await mustRevert('safeTransferFrom reverts', () =>
  creds.connect(attackerSigner).safeTransferFrom(holderAddr, recipientAddr, 1, 1, '0x'),
);
check('holder is unchanged after the attempt', same(await creds.holderOf(1), holderAddr));

// The revert reason is checked through a static call made by the holder, because that is
// the only route to _update that does not first stop on ERC-1155's own approval check. The
// guard under test lives after that check, so calling it any other way proves a different
// thing. Ganache also refuses at estimateGas without carrying revert data, so sending the
// transaction would prove it reverted but not why.
// The revert reason is read straight from an eth_call rather than through ethers'
// staticCall, which on a signer-connected contract goes via the contract runner and comes
// back saying the runner cannot call -- which proves nothing about the contract. A raw
// eth_call returns the revert data itself.
//
// It is also sent from the holder. ERC-1155 checks operator approval before _update, so a
// call from anyone else stops at that check and never reaches the guard under test.
const transferData = creds.interface.encodeFunctionData('safeTransferFrom', [
  holderAddr,
  recipientAddr,
  1,
  1,
  '0x',
]);
try {
  await provider.call({ to: await creds.getAddress(), from: holderAddr, data: transferData });
  check('reverts with TransfersDisabled', false, 'it did not revert');
} catch (e) {
  // Ganache returns the revert as bare data with "unknown custom error". The selector is
  // compared directly, because a test that only proves *something* reverted would pass just
  // as happily if the reason were an out-of-gas or a typo in the address.
  const want = creds.interface.getError('TransfersDisabled')?.selector;
  const got = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
  const matched = typeof got === 'string' && want && got.toLowerCase().startsWith(want.toLowerCase());
  check(
    'reverts with TransfersDisabled, not something incidental',
    matched || /TransfersDisabled/i.test(reason(e)),
    matched ? '' : `${reason(e)} -- wanted selector ${want}`,
  );
}

// The batch path is a separate entry point and has to be refused too.
await mustRevert('safeBatchTransferFrom reverts too', () =>
  creds.connect(holderSigner).safeBatchTransferFrom(holderAddr, recipientAddr, [1], [1], '0x'),
);

// setApprovalForAll is deliberately left working. An approval with no possible transfer
// behind it is inert, and disabling it would make the token non-compliant with ERC-1155
// for no security gain, at the cost of wallet UIs possibly refusing to display it. What
// matters is that an approved operator still cannot move anything.
await creds.connect(holderSigner).setApprovalForAll(attackerAddr, true);
check('an operator can be approved (harmless on its own)', await creds.isApprovedForAll(holderAddr, attackerAddr));
await mustRevert('...but an approved operator still cannot transfer', () =>
  creds.connect(attackerSigner).safeTransferFrom(holderAddr, recipientAddr, 1, 1, '0x'),
);
check('...and the holder is untouched', same(await creds.holderOf(1), holderAddr));

console.log('\n    idempotency');
await mustRevert('re-anchoring the same ref reverts', () =>
  creds.issue(holderAddr, 2, HASH, 'LEARNOVIZE-2026-TEST01', HASH2),
);
check('...and did not mint a second one', (await creds.balanceOf(holderAddr, 1)) === 1n);

console.log('\n    revocation');
await creds.revoke(1, REASON);
check('marks it revoked', (await creds.isRevoked(1)) === true);
check('burns the balance', (await creds.balanceOf(holderAddr, 1)) === 0n);
check('keeps the holder recorded', same(await creds.holderOf(1), holderAddr), 'losing this would make restore impossible');
check('keeps the certificate number', (await creds.get(1))[1] === 'LEARNOVIZE-2026-TEST01');
check('stores the reason hash', (await creds.get(1))[5] === REASON);

await mustRevert('revoking twice reverts', () => creds.revoke(1, HASH));

await creds.restore(1);
check('restore undoes it', (await creds.isRevoked(1)) === false);
check('restore re-mints to the original holder', (await creds.balanceOf(holderAddr, 1)) === 1n);

console.log('\n    authorisation');
await mustRevert('a non-owner cannot mint', () =>
  creds.connect(stranger).issue(recipientAddr, 3, HASH, 'FORGED', '0x' + '11'.repeat(32)),
);

await mustRevert('a non-owner cannot revoke', () => creds.connect(stranger).revoke(1, HASH));

console.log('\n  LearnovizePoints');

const points = await deploy('LearnovizePoints.sol', 'LearnovizePoints', [await owner.getAddress()]);
const REF1 = '0x' + 'a1'.repeat(32);
const REF2 = '0x' + 'b2'.repeat(32);

await points.credit(learnerAddr, 20, 1, REF1); // paidDayAttended
await points.credit(learnerAddr, 50, 2, REF2); // certificateEarned
check('credits accumulate', (await points.balanceOf(learnerAddr)) === 70n);

await mustRevert('re-crediting the same ref reverts', () => points.credit(learnerAddr, 20, 1, REF1));
check('...and the balance is untouched', (await points.balanceOf(learnerAddr)) === 70n);

// ethers v6 exposes the ABI as .fragments; .functions is v5. Reading the wrong one makes
// this assertion silently pass on an empty list, which for "has no transfer at all" is
// the one outcome that would be meaningless.
const pointFns = points.interface.fragments.filter((f) => f.type === 'function').map((f) => f.format('sighash'));
check(
  'has no transfer, approve or allowance function at all',
  pointFns.every((f) => !/transfer|approve|allowance/i.test(f)),
  pointFns.filter((f) => /transfer|approve|allowance/i.test(f)).join(', '),
);

await points.debit(learnerAddr, 30, REASON);
check('debits for platform spend', (await points.balanceOf(learnerAddr)) === 40n);

await mustRevert('cannot overspend', () => points.debit(learnerAddr, 1000, REASON));
check('...and the balance survives the attempt', (await points.balanceOf(learnerAddr)) === 40n);

await points.adjust(learnerAddr, -10, '0x' + 'c3'.repeat(32), 'day was wrongly marked attended');
check('adjust corrects downward', (await points.balanceOf(learnerAddr)) === 30n);
await points.adjust(learnerAddr, 5, '0x' + 'd4'.repeat(32), 'rule applied retrospectively');
check('adjust corrects upward', (await points.balanceOf(learnerAddr)) === 35n);

await mustRevert('a non-owner cannot credit', () =>
  points.connect(stranger).credit(learnerAddr, 1000, 1, '0x' + 'e5'.repeat(32)),
);
check('...and no points appeared', (await points.balanceOf(learnerAddr)) === 35n);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

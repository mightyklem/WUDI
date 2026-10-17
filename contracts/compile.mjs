/**
 * Compile and size both contracts.
 *
 * The point of this file is that it fails loudly. An uncompiled contract is a rumour: it
 * looks like working code in a diff and nobody finds out until deployment, which on a
 * credential system means finding out in public.
 */
import solc from 'solc';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findImports(path) {
  try {
    // A bare specifier like "@openzeppelin/contracts/..." is a package, not a file beside
    // this script. Resolving it as a relative path is why the first run of this reported
    // two missing imports for a dependency that was installed and sitting right there.
    const abs = path.startsWith('@') || path.startsWith('.')
      ? (path.startsWith('.') ? resolve(here, path) : require.resolve(path))
      : resolve(here, path);
    return { contents: readFileSync(abs, 'utf8') };
  } catch (e) {
    // solc wants a source-unit name it can resolve; anything unresolvable is a real
    // error and must surface rather than become a silent empty import.
    return { error: `not found: ${path} (${e.message})` };
  }
}

const targets = ['LearnovizeCredentials.sol', 'LearnovizePoints.sol'];

const input = {
  language: 'Solidity',
  sources: Object.fromEntries(targets.map((f) => [f, { content: readFileSync(resolve(here, f), 'utf8') }])),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let failed = false;
for (const e of out.errors ?? []) {
  if (e.severity === 'error') {
    failed = true;
    console.error(`  ERROR  ${e.formattedMessage?.trim() ?? e.message}`);
  } else {
    console.log(`  warn   ${(e.formattedMessage ?? e.message).split('\n')[0]}`);
  }
}

if (failed) {
  console.error('\n  compilation FAILED');
  process.exit(1);
}

for (const file of Object.keys(out.contracts ?? {})) {
  for (const [name, c] of Object.entries(out.contracts[file])) {
    const size = (c.evm.deployedBytecode.object.length / 2) | 0;
    const limit = 24576;
    console.log(
      `  ${name.padEnd(24)} ${String(size).padStart(6)} bytes   ` +
      `${size > limit ? `OVER the 24KB limit by ${size - limit}` : `${((size / limit) * 100).toFixed(1)}% of the EIP-170 limit`}`,
    );
  }
}
console.log('\n  both contracts compile');

// npm run keel:compare-cr-0011 — prints how a package Keel generates for the change behind CR-0011 compares with the
// hand-written changes/CR-0011/ (CR-0013). Uses the fake provider unless --model is given (then the models in Settings).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareCr0011 } from '../src/lib/changes/compare-cr-0011';
import { providerWriter, type Writer } from '../src/lib/generate/writer';
import { fakeReply } from '../src/lib/providers/fake';
import { userDir } from '../src/lib/settings/user-dir';

const root = mkdtempSync(join(tmpdir(), 'keel-cr-0011-'));
const store = { root, user: userDir() };
const write: Writer = process.argv.includes('--model') ? providerWriter(store) : async (_t, m) => fakeReply('anthropic', m);
const result = await compareCr0011(store, process.cwd(), write);
console.log(`Generated in ${root}`);
result.report.forEach((line) => console.log(`- ${line}`));

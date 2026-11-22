// Command-line helpers, for example: npm run keel -- reindex --dir <folder>
import { resolve } from 'node:path';
import { openIndex } from './lib/store/db';
import { rebuildIndex } from './lib/store/reindex';
import { userDir } from './lib/settings/user-dir';
import { projectRoot } from './lib/store/workspace';

const args = process.argv.slice(2);
const [command] = args;
const dirFlag = args.indexOf('--dir');
const dir = resolve(dirFlag >= 0 ? (args[dirFlag + 1] ?? '.') : '.');

if (command === 'reindex') {
  const root = projectRoot({ KEEL_PROJECT_DIR: dir });
  const index = openIndex(root);
  const report = await rebuildIndex({ root, index, user: userDir() });
  index.close();
  console.log(`Reindexed ${root}: ${report.documents} documents, ${report.versions} versions.`);
  report.skipped.forEach((s) => console.warn(`Skipped ${s}`));
} else {
  console.error(`keel ${command ?? ''}: unknown command. Available: reindex`);
  process.exit(1);
}

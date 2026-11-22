// Command-line helpers, run from Keel's folder:
//   npm run keel -- reindex [--dir <folder>]
//   npm run keel -- import ~/.keel/projects/<slug> --dir <folder>
//   npm run keel -- check [--dir <folder>]   the startup check (CR-0012)
import { resolve } from 'node:path';
import { importProject } from './lib/store/adopt';
import { openIndex } from './lib/store/db';
import { rebuildIndex } from './lib/store/reindex';
import { legacyHome, userDir } from './lib/settings/user-dir';
import { runStartupCheck, startupLines } from './lib/startup/check';
import { projectRoot } from './lib/store/workspace';

const args = process.argv.slice(2);
const [command, ...rest] = args;
const dirFlag = args.indexOf('--dir');
const dir = resolve(dirFlag >= 0 ? (args[dirFlag + 1] ?? '.') : '.');

if (command === 'reindex') {
  const root = projectRoot({ KEEL_PROJECT_DIR: dir });
  const index = openIndex(root);
  const report = await rebuildIndex({ root, index, user: userDir() });
  index.close();
  console.log(`Reindexed ${root}: ${report.documents} documents, ${report.versions} versions.`);
  report.skipped.forEach((s) => console.warn(`Skipped ${s}`));
} else if (command === 'import') {
  const source = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--dir');
  if (!source || dirFlag < 0) {
    console.error('Usage: npm run keel -- import ~/.keel/projects/<slug> --dir <folder>');
    process.exit(1);
  }
  const index = openIndex(dir, ':memory:');
  const imported = await importProject(resolve(source), { root: dir, index, user: userDir() }, legacyHome());
  index.close();
  if (!imported.ok) {
    console.error(`keel import: ${imported.message}`);
    process.exit(1);
  }
  console.log(`Imported ${imported.value.project.title} (${imported.value.project.id}) into ${dir}: ${imported.value.copied.join(', ')}. Open it with npx keel ${dir}`);
} else if (command === 'check') {
  // The startup check (CR-0012) for a folder, as `npx keel` prints it before the browser opens.
  const result = await runStartupCheck({ root: projectRoot({ KEEL_PROJECT_DIR: dir }), user: userDir() }, { force: true, quiet: true });
  startupLines(result).forEach((line) => console.log(line));
  process.exit(result.ok ? 0 : 2);
} else {
  console.error(`keel ${command ?? ''}: unknown command. Available: reindex, import, check`);
  process.exit(1);
}

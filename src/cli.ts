// Command-line helpers. `keel import` runs this compiled (dist/cli.mjs, npm run build:cli); in a clone, npm run keel -- ...
//   keel import ~/.keel/projects/<slug> --dir <folder>
//   npm run keel -- check [--dir <folder>]   the startup check (CR-0012)
import { resolve } from 'node:path';
import { importProject } from './lib/store/adopt';
import { legacyHome, userDir } from './lib/settings/user-dir';
import { runStartupCheck, startupLines } from './lib/startup/check';
import { projectRoot } from './lib/store/workspace';

const args = process.argv.slice(2);
const [command, ...rest] = args;
const dirFlag = args.indexOf('--dir');
const dir = resolve(dirFlag >= 0 ? (args[dirFlag + 1] ?? '.') : '.');

if (command === 'import') {
  const source = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--dir');
  if (!source || dirFlag < 0) {
    console.error('Usage: keel import ~/.keel/projects/<slug> --dir <folder>');
    process.exit(1);
  }
  const imported = await importProject(resolve(source), { root: dir, user: userDir() }, legacyHome());
  if (!imported.ok) {
    console.error(`keel import: ${imported.message}`);
    process.exit(1);
  }
  console.log(`Imported ${imported.value.project.title} (${imported.value.project.id}) into ${dir}: ${imported.value.copied.join(', ')}. Open it with npx keel-sdlc ${dir}`);
} else if (command === 'check') {
  // The startup check (CR-0012) for a folder, as `npx keel` prints it before the browser opens.
  const result = await runStartupCheck({ root: projectRoot({ KEEL_PROJECT_DIR: dir }), user: userDir() }, { force: true, quiet: true });
  startupLines(result).forEach((line) => console.log(line));
  process.exit(result.ok ? 0 : 2);
} else {
  console.error(`keel ${command ?? ''}: unknown command. Available: import, check`);
  process.exit(1);
}

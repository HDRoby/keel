// Command-line helpers, for example: npm run keel -- reindex
import { openIndex } from './lib/store/db';
import { rebuildIndex } from './lib/store/reindex';
import { keelHome } from './lib/store/workspace';

const [command] = process.argv.slice(2);

if (command === 'reindex') {
  const home = keelHome();
  const index = openIndex(home);
  const report = await rebuildIndex({ home, index });
  index.close();
  console.log(`Reindexed ${home}: ${report.projects} projects, ${report.documents} documents, ${report.versions} versions.`);
  report.skipped.forEach((s) => console.warn(`Skipped ${s}`));
} else {
  console.error(`keel ${command ?? ''}: unknown command. Available: reindex`);
  process.exit(1);
}

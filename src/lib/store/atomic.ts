// Writes a file so a reader never sees it half written: write a temporary file next to it, then rename.
// A rename within one folder is atomic, so a page that reloads during a save reads the old or the new file.
import { renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, data);
  renameSync(temp, file);
}

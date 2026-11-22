// Opening a folder that already uses Keel (REQ-012, CR-0010): before the current stage opens, say only what needs
// attention: a config format older than this Keel, changes waiting in Read-back, and templates, styles or standards
// that the config names but the folder no longer has.
import { readStyleFile } from '../brainstorm/styles';
import { pendingUpgrade, type PendingUpgrade } from '../config/migrate';
import { readbackState } from '../readback/changes';
import { readStandard } from '../standards/library';
import type { Store } from '../store/db';
import { readProject } from '../store/workspace';
import { parseTemplateRef, readTemplate } from '../templates/library';

export interface KeelChecks { upgrade?: PendingUpgrade; pending: number; missing: string[] }

export function checkKeelFolder(store: Store): KeelChecks {
  const project = readProject(store.root);
  const missing: string[] = [];
  if (project.ok) {
    for (const [kind, ref] of Object.entries(project.value.templates)) {
      const parsed = ref ? parseTemplateRef(ref) : undefined;
      if (ref && (!parsed || !readTemplate(store.root, parsed.id, parsed.version).ok)) missing.push(`The ${kind} template ${ref}`);
    }
    if (project.value.style && !readStyleFile(store.root, project.value.style).ok) missing.push(`The brainstorm style ${project.value.style}`);
    for (const ref of project.value.standards) if (!readStandard(store.root, ref).ok) missing.push(`The standard ${ref}`);
  }
  let pending = 0;
  try {
    pending = readbackState(store).pending.length;
  } catch {
    pending = 0;
  }
  return { ...(pendingUpgrade(store.root) ? { upgrade: pendingUpgrade(store.root) } : {}), pending, missing };
}

export const needsAttention = (c: KeelChecks) => Boolean(c.upgrade) || c.pending > 0 || c.missing.length > 0;

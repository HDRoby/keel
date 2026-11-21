// The impact of a version by requirement ID (REQ-008): requirements whose statement changed, or that
// appear on a changed line, and the tasks and scenarios linked to them.
import { changedRequirements, impactOf, type Impact, type Trace } from '../trace/index';
import { reqIds } from '../trace/parse';
import type { LineChange } from './diff';

export interface VersionImpact {
  requirements: string[];
  impact: Impact;
}

export function versionImpact(before: string, after: string, changes: LineChange[], trace: Trace): VersionImpact {
  const statements = changedRequirements(before, after);
  const onChangedLines = reqIds(changes.filter((c) => c.kind !== 'same').map((c) => c.text).join('\n'));
  const requirements = [...new Set([...statements.changed, ...statements.added, ...statements.removed, ...onChangedLines])].sort();
  return { requirements, impact: impactOf(trace, requirements) };
}

// Upgrades of .keel/config.yml (REQ-012, CR-0010). `format` says which shape the file has; a config without it is
// format 1. Each upgrade is one function that lists what it changes; they are applied in one Keel commit, and only
// after the user agrees.
import { fail, ok, type Result } from '../result';
import type { Store } from '../store/db';
import { CONFIG_FORMAT, readConfig, updateConfig, type Project, type ProjectError } from '../store/workspace';

interface Upgrade { from: number; changes: (config: Record<string, unknown>) => string[]; apply: (config: Record<string, unknown>) => Record<string, unknown> }

const UPGRADES: Upgrade[] = [
  {
    from: 1,
    changes: (c) => [
      'Adds `format: 2`, so later versions of Keel know the shape of this file.',
      ...(c.mock_gate === undefined ? ['Adds `mock_gate: recommended` (Clickable mock before the plan, CR-0009).'] : []),
    ],
    apply: (c) => ({ format: 2, mock_gate: c.mock_gate ?? 'recommended' }),
  },
];

export function configFormat(config: Record<string, unknown>): number {
  return typeof config.format === 'number' && Number.isInteger(config.format) ? config.format : 1;
}

export interface PendingUpgrade { from: number; to: number; changes: string[] }

/** What upgrading this folder's config would change; undefined when it is current. */
export function pendingUpgrade(root: string): PendingUpgrade | undefined {
  const config = readConfig(root);
  if (!config) return undefined;
  const from = configFormat(config);
  if (from >= CONFIG_FORMAT) return undefined;
  const steps = UPGRADES.filter((u) => u.from >= from && u.from < CONFIG_FORMAT);
  return { from, to: CONFIG_FORMAT, changes: steps.flatMap((u) => u.changes(config)) };
}

/** Applies every upgrade in order, in one Keel commit. */
export async function upgradeConfig(store: Store): Promise<Result<Project, ProjectError>> {
  const config = readConfig(store.root);
  if (!config) return fail('not-initialised', 'This folder has no .keel/config.yml');
  const from = configFormat(config);
  if (from >= CONFIG_FORMAT) return fail('invalid-config', 'The config is already current');
  let patch: Record<string, unknown> = {};
  for (const u of UPGRADES.filter((x) => x.from >= from && x.from < CONFIG_FORMAT)) patch = { ...patch, ...u.apply({ ...config, ...patch }) };
  const upgraded = await updateConfig(store, patch, `Keel: Upgrade config from format ${from} to ${CONFIG_FORMAT}`);
  return upgraded.ok ? ok(upgraded.value) : upgraded;
}

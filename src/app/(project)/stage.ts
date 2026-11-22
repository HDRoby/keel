// Shared loading for the stage pages: the project, its gates and the gate of the page's stage.
import { notFound } from 'next/navigation';
import type { StageFrame } from '@/components/StageBar';
import type { Stage } from '@/lib/documents/types';
import { projectState, stageSummaries } from '@/lib/gates/approvals';
import { stageGates, type StageGate } from '@/lib/gates/rules';
import type { Store } from '@/lib/store/db';
import { defaultAuthor } from '@/lib/settings/settings';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';

export interface StagePage extends StageFrame {
  store: Store;
  reviewer: string;   // default name for review and decision forms: git config user.name, the name in Settings, else the project author
}

/** Props of a stage page that shows errors from its forms. */
export interface StageProps {
  searchParams: Promise<{ error?: string }>;
}

export async function loadStage(stage: Stage): Promise<StagePage> {
  const store = serverStore();
  const project = readProject(store.root);
  if (!project.ok) notFound();
  const gates = stageGates(projectState(store));
  const reviewer = (await defaultAuthor(store)) || project.value.author;
  return { store, project: project.value, gates, gate: gates.find((g) => g.stage === stage) as StageGate, summaries: stageSummaries(store), reviewer };
}

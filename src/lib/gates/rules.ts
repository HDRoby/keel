// Stage gates (REQ-005): each stage unlocks only when the one before it is approved.
// Plan needs a Go decision and an accepted scenario for every requirement (CR-0006).
// Handoff needs an approved plan and a latest decision of Go.
import type { DocumentStatus, Stage } from '../documents/types';

export type Decision = 'go' | 'park' | 'no-go';

/** What the gates look at. Gathered from the project files by projectState (approvals.ts). */
export interface ProjectState {
  requiredCaptured: boolean;
  intent?: DocumentStatus;
  spec?: DocumentStatus;
  plan?: DocumentStatus;
  decisions: Decision[];   // oldest first; the latest one counts
  uncovered?: string[];    // spec requirements with no accepted scenario (REQ-005, CR-0006)
  undecided?: string[];    // design topics not decided yet (REQ-005, CR-0007)
}

export interface StageGate {
  stage: Stage;
  label: string;
  available: boolean;
  reason?: string;         // why it is locked
}

export const STAGES: { stage: Stage; label: string }[] = [
  { stage: 'explore', label: 'Explore' },
  { stage: 'intent', label: 'Intent' },
  { stage: 'spec', label: 'Spec' },
  { stage: 'plan', label: 'Plan' },
  { stage: 'handoff', label: 'Handoff' },
];

export const REASONS: Record<Exclude<Stage, 'explore'>, string> = {
  intent: 'Needs every required section of the intent template',
  spec: 'Needs an approved intent',
  plan: 'Needs a Go decision',
  handoff: 'Needs an approved plan',
};

/** Whether each stage is open, and why not. */
export function stageGates(state: ProjectState): StageGate[] {
  const open: Record<Stage, boolean> = {
    explore: true,
    intent: state.requiredCaptured || state.intent !== undefined,
    spec: state.intent === 'approved',
    plan: state.decisions.at(-1) === 'go' && (state.uncovered ?? []).length === 0 && (state.undecided ?? []).length === 0,
    handoff: state.plan === 'approved' && state.decisions.at(-1) === 'go',
  };
  // Handoff also needs the latest decision to be Go (owner decision): a later Park or No-go locks it.
  const uncovered = state.uncovered ?? [];
  const undecided = state.undecided ?? [];
  const planWaits = [
    ...(uncovered.length ? [`at least one accepted scenario for ${uncovered.join(', ')}`] : []),
    ...(undecided.length ? [`every design topic decided (${undecided.join(', ')})`] : []),
  ];
  const reason = (stage: Exclude<Stage, 'explore'>) =>
    stage === 'plan' && state.decisions.at(-1) === 'go' && planWaits.length
      ? `Needs ${planWaits.join(', and ')}`
      : stage === 'handoff' && state.plan === 'approved' ? REASONS.plan : REASONS[stage];
  return STAGES.map(({ stage, label }) => ({
    stage, label, available: open[stage], ...(open[stage] || stage === 'explore' ? {} : { reason: reason(stage) }),
  }));
}

export function gateFor(state: ProjectState, stage: Stage): StageGate {
  return stageGates(state).find((g) => g.stage === stage) as StageGate;
}

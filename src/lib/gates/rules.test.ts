import { describe, expect, it } from 'vitest';
import { gateFor, stageGates, type ProjectState } from './rules';

const fresh: ProjectState = { requiredCaptured: false, decisions: [] };

function open(state: ProjectState) {
  return stageGates(state).filter((g) => g.available).map((g) => g.stage);
}

describe('stage gates', () => {
  it('opens only Explore at first, and says why the others are locked', () => {
    expect(open(fresh)).toEqual(['explore']);
    expect(stageGates(fresh).map((g) => g.reason)).toEqual([
      undefined, 'Needs every required section of the intent template', 'Needs an approved intent', 'Needs a Go decision', 'Needs an approved plan',
    ]);
  });

  it('opens each stage when the one before is approved', () => {
    expect(open({ ...fresh, requiredCaptured: true })).toEqual(['explore', 'intent']);
    expect(open({ ...fresh, intent: 'draft' })).toEqual(['explore', 'intent']);
    expect(open({ ...fresh, intent: 'approved' })).toEqual(['explore', 'intent', 'spec']);
    expect(open({ ...fresh, intent: 'approved', decisions: ['go'] })).toEqual(['explore', 'intent', 'spec', 'plan']);
    expect(open({ ...fresh, intent: 'approved', decisions: ['go'], plan: 'approved' })).toEqual(['explore', 'intent', 'spec', 'plan', 'handoff']);
  });

  it('locks Handoff again when a later decision is not Go', () => {
    const approved = { ...fresh, intent: 'approved' as const, plan: 'approved' as const };
    expect(gateFor({ ...approved, decisions: ['go', 'park'] }, 'handoff')).toEqual({ stage: 'handoff', label: 'Handoff', available: false, reason: 'Needs a Go decision' });
    expect(gateFor({ ...approved, decisions: ['go'] }, 'handoff').available).toBe(true);
    expect(gateFor({ ...fresh, decisions: ['go'] }, 'handoff').reason).toBe('Needs an approved plan');
  });

  it('uses the latest decision', () => {
    expect(gateFor({ ...fresh, decisions: ['go', 'park'] }, 'plan')).toMatchObject({ available: false, reason: 'Needs a Go decision' });
    expect(gateFor({ ...fresh, decisions: ['no-go', 'go'] }, 'plan').available).toBe(true);
  });
});

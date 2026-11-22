import { describe, expect, it } from 'vitest';
import { meaningfulChange, snapshot, waitBeforeReview } from './scheduler';

describe('review scheduler rules', () => {
  it('reviews after a finished sentence or 20 characters, not after a few letters', () => {
    expect(meaningfulChange('Teams lose', 'Teams lose receipts.')).toBe(true);
    expect(meaningfulChange('Teams', 'Teams lose rec')).toBe(false);
    expect(meaningfulChange('', 'Teams lose receipts every week')).toBe(true);
    expect(meaningfulChange('Same text.', 'Same text.')).toBe(false);
    expect(meaningfulChange('A long text that the user wrote earlier', 'A long text that the team wrote earlier')).toBe(false);
    expect(meaningfulChange('Short', 'Short, and now a much longer clause')).toBe(true);
  });

  it('keeps reviews at least the interval apart', () => {
    expect(waitBeforeReview(10_000, undefined, 10)).toBe(0);
    expect(waitBeforeReview(15_000, 10_000, 10)).toBe(5_000);
    expect(waitBeforeReview(25_000, 10_000, 10)).toBe(0);
    expect(waitBeforeReview(10_500, 10_000, 0)).toBe(0);
  });

  it('fingerprints what would be sent', () => {
    const a = [{ key: 'Problem', value: 'x', origin: 'user' }, { key: 'Requirements', value: '', rows: [{ text: 'r', origin: 'user' }], origin: 'user' }];
    expect(snapshot(a)).toBe(snapshot(structuredClone(a)));
    expect(snapshot(a)).not.toBe(snapshot([{ ...a[0], value: 'y' } as (typeof a)[0], a[1] as (typeof a)[0]]));
  });
});

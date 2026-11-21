import { describe, expect, it } from 'vitest';
import { fail, ok } from './result';

describe('result', () => {
  it('wraps a value', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it('wraps a typed error with a message', () => {
    expect(fail('not-found', 'missing')).toEqual({ ok: false, error: 'not-found', message: 'missing' });
  });
});

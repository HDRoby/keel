import { describe, expect, it } from 'vitest';
import { formFields } from './form-fields';

describe('formFields', () => {
  it('keeps submitted fields and drops Next action fields', () => {
    const form = new FormData();
    form.set('id', 'abc');
    form.set('$ACTION_ID_123', '');
    form.set('$ACTION_REF_1', '');
    expect(formFields(form)).toEqual({ id: 'abc' });
  });

  it('collects list fields into arrays, empty when nothing was ticked', () => {
    const form = new FormData();
    form.append('standards', 'a@1');
    form.append('standards', 'b@2');
    expect(formFields(form, ['standards', 'other'])).toEqual({ standards: ['a@1', 'b@2'], other: [] });
  });
});

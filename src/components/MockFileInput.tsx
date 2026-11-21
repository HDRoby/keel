'use client';
// File input for mock references that refuses files over 10 MB before they are sent (REQ-010).
// The server checks again; this only spares the user Next's error page for a too-large request.
import type { ChangeEvent } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;

export function MockFileInput() {
  function check(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.setCustomValidity(file && file.size > MAX_BYTES ? 'Files can be up to 10 MB' : '');
    event.target.reportValidity();
  }
  return (
    <input name="file" type="file" onChange={check}
      accept=".png,.jpg,.jpeg,.pdf,.html,.htm,image/png,image/jpeg,application/pdf,text/html" />
  );
}

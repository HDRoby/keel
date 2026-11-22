// A versioned reference such as "challenger@1" or "standard-intent@4", shared by the libraries. A module of its own,
// with no imports, so the libraries can use it without importing each other.
export const VERSIONED_REF = /^([a-z0-9][a-z0-9-]*)@(\d+)$/;

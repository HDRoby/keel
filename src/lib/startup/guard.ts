// Setup mode (REQ-005, CR-0012): while the startup check fails, only Startup check and Settings open, and Project
// setup when the project config is the problem. Every other page goes to the Startup check.
import type { StartupResult } from './check';

export function allowedInSetup(result: StartupResult): string[] {
  return ['/check', '/settings', ...(result.projectBad ? ['/setup'] : [])];
}

/** Where a page request goes in setup mode, or undefined when it may open. */
export function setupRedirect(result: StartupResult, path: string): string | undefined {
  if (result.ok) return undefined;
  return allowedInSetup(result).some((p) => path === p || path.startsWith(`${p}/`)) ? undefined : '/check';
}

// Runs once when the Keel server starts: begins the read-back schedule (REQ-007, ADR-0008).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startReadbackSchedule } = await import('./lib/readback/schedule');
  const { serverStore } = await import('./lib/store/server-store');
  startReadbackSchedule(() => serverStore());
}

// Runs read-back on a schedule while Keel runs (ADR-0008): every KEEL_READBACK_MINUTES (default 15); 0 turns it off.
import type { Store } from '../store/db';
import { checkAll, DEFAULT_INTERVAL_MINUTES } from './poll';

/** Minutes between checks, from the environment. */
export function readbackInterval(env: Record<string, string | undefined> = process.env): number {
  const raw = env.KEEL_READBACK_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_MINUTES;
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_INTERVAL_MINUTES;
}

const holder = globalThis as typeof globalThis & { keelReadback?: ReturnType<typeof setInterval> };

/** Starts the schedule once per process. One check at a time; a failing project never stops the others. */
export function startReadbackSchedule(store: () => Store, env: Record<string, string | undefined> = process.env): boolean {
  const minutes = readbackInterval(env);
  if (minutes === 0 || holder.keelReadback) return false;
  let running = false;
  holder.keelReadback = setInterval(() => {
    if (running) return;
    running = true;
    checkAll(store()).catch(() => undefined).finally(() => { running = false; });
  }, minutes * 60_000);
  holder.keelReadback.unref?.();
  return true;
}

export function stopReadbackSchedule(): void {
  if (holder.keelReadback) clearInterval(holder.keelReadback);
  holder.keelReadback = undefined;
}

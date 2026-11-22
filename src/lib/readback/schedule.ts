// Runs read-back on a schedule while Keel runs (ADR-0012): every KEEL_READBACK_SECONDS (default 60); 0 turns it off.
// A check reads the local repository only, so it is cheap and never commits.
import type { Store } from '../store/db';
import { checkAll } from './check';

export const DEFAULT_INTERVAL_SECONDS = 60;

/** Seconds between checks, from the environment. */
export function readbackInterval(env: Record<string, string | undefined> = process.env): number {
  const raw = env.KEEL_READBACK_SECONDS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_SECONDS;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_INTERVAL_SECONDS;
}

const holder = globalThis as typeof globalThis & { keelReadback?: ReturnType<typeof setInterval> };

/** Starts the schedule once per process. One check at a time; a failing check never stops the schedule. */
export function startReadbackSchedule(store: () => Store, env: Record<string, string | undefined> = process.env): boolean {
  const seconds = readbackInterval(env);
  if (seconds === 0 || holder.keelReadback) return false;
  let running = false;
  holder.keelReadback = setInterval(() => {
    if (running) return;
    running = true;
    checkAll(store()).catch(() => undefined).finally(() => { running = false; });
  }, seconds * 1000);
  holder.keelReadback.unref?.();
  return true;
}

export function stopReadbackSchedule(): void {
  if (holder.keelReadback) clearInterval(holder.keelReadback);
  holder.keelReadback = undefined;
}

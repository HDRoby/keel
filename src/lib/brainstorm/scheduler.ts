// When Explore asks the assistant for a review (task R10). Pure rules, used by the page in the browser:
// - leaving a section whose text changed since the last review;
// - a pause in typing after a meaningful change (a finished sentence, or 20 or more characters);
// - Enter in a reply line; opening Explore when something changed.
// At most one review at a time and at most one every `intervalSeconds`; the latest change wins.

/** A change worth a review: a sentence was finished, or at least 20 characters changed. */
export function meaningfulChange(before: string, after: string): boolean {
  if (before === after) return false;
  const finished = /[.!?](["')\]]*)\s*$/.test(after.trim()) && after.trim() !== before.trim();
  return finished || Math.abs(after.length - before.length) >= 20 || editDistanceAtLeast(before, after, 20);
}

/** True when the two texts differ in at least `n` characters (cheap: common prefix and suffix removed). */
function editDistanceAtLeast(a: string, b: string, n: number): boolean {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  return Math.max(endA - start, endB - start) >= n;
}

/** Milliseconds to wait before the next review may start. */
export function waitBeforeReview(now: number, lastReviewStarted: number | undefined, intervalSeconds: number): number {
  if (lastReviewStarted === undefined) return 0;
  return Math.max(0, lastReviewStarted + intervalSeconds * 1000 - now);
}

/** Fingerprint of what the page would send, to skip a review when nothing changed since the last one. */
export function snapshot(sections: { key: string; value: string; rows?: { text: string; origin: string }[]; origin: string }[]): string {
  return JSON.stringify(sections.map((s) => [s.key, s.rows ? s.rows.map((r) => `${r.origin}:${r.text}`) : `${s.origin}:${s.value}`]));
}

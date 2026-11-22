// What is left of the GitHub push (T8b), replaced in task R8 by an optional `git push` to the folder's own
// remote (src/lib/store/remote.ts): showing a git error without anything token-like in it.

/** The first line of a git error, with anything token-like hidden, so it can be shown. */
export function cleanError(error: unknown, token?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n').find((l) => l.trim()) ?? 'git failed';
  return (token ? firstLine.split(token).join('***') : firstLine)
    .replace(/AUTHORIZATION: basic \S+/gi, 'AUTHORIZATION: ***')
    .replace(/(https?:\/\/)[^@/\s]+@/g, '$1***@')
    .slice(0, 300);
}

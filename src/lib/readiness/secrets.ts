// Files that look like secrets (CR-0015, rule SA-02). Read locally. findSecrets returns the file and the field name
// only: a value is matched here and never returned, logged, sent or written anywhere (Security baseline v2).
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface SecretHit { path: string; field?: string }

const EXAMPLE = /\.(example|sample|template|dist)$/i;
/** File names that hold secrets by convention: .env files, keys and credential files. */
export function secretByName(path: string): boolean {
  const name = basename(path);
  if (EXAMPLE.test(name)) return false;
  return /^\.env(\..+)?$/.test(name) || /\.(pem|key|p12|pfx)$/i.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(name) || /^credentials.*\.json$/i.test(name);
}

/** Config files that may hold a key even when no value is found today, so they are never offered to the model. */
export function mayHoldKeys(path: string): boolean {
  return secretByName(path) || /(^|\/)mcp\.json$/i.test(path) || /(^|\/)\.npmrc$/.test(path) || /(^|\/)\.netrc$/.test(path);
}

const CONFIG = /\.(json|jsonc|ya?ml|toml)$/i;
const LOCKS = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|composer\.lock|Cargo\.lock|poetry\.lock)$/;
const FIELD = /(?:^|[\s{,])["']?([A-Za-z0-9_.-]*?(?:api[_-]?key|apikey|token|secret|password|passwd|private[_-]?key|client[_-]?secret|access[_-]?key)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*/gi;
const MAX_BYTES = 256 * 1024;

/** The value token after a colon or equals sign: a quoted string, or up to a space, comma, brace or comment. */
function valueAt(text: string): string {
  const quote = text[0];
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1);
    return end > 0 ? text.slice(1, end) : '';
  }
  return /^[^\s,}#\]]*/.exec(text)?.[0] ?? '';
}

/** True for a literal value: not empty, not a reference or a placeholder, not a nested object or list. */
function literalValue(value: string): boolean {
  if (value.length < 6) return false;
  if (/^[[{]/.test(value)) return false;
  if (/^(\$|%|<|\{\{|process\.env|env\(|null$|true$|false$|none$)/i.test(value)) return false;
  return !/^(x+|\*+|changeme|your[-_ ].*|replace[-_ ]?me|todo)$/i.test(value);
}

/** The field names with a literal value in one config text. The values themselves are not kept. */
export function secretFields(text: string): string[] {
  const fields: string[] = [];
  for (const line of text.split('\n')) {
    for (const match of line.matchAll(FIELD)) {
      const field = match[1] as string;
      if (literalValue(valueAt(line.slice((match.index ?? 0) + match[0].length))) && !fields.includes(field)) fields.push(field);
    }
  }
  return fields;
}

/** Files that look like secrets among the given (tracked) files: by name, or a key-like field with a value in config. */
export function findSecrets(root: string, files: string[]): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const path of files) {
    if (secretByName(path)) {
      hits.push({ path });
      continue;
    }
    if (!CONFIG.test(path) || LOCKS.test(path)) continue;
    try {
      if (statSync(join(root, path)).size > MAX_BYTES) continue;
      for (const field of secretFields(readFileSync(join(root, path), 'utf8'))) hits.push({ path, field });
    } catch {
      // unreadable: nothing to report
    }
  }
  return hits;
}

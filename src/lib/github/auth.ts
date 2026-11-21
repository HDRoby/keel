// The GitHub token for pushing the handoff (REQ-006, T8b). A fine-grained personal access token with
// Contents read and write on the one repository is enough (least privilege). Stored encrypted, never shown.
import { fail, ok, type Result } from '../result';
import { decryptSecret, encryptSecret, workspaceKey } from '../settings/secrets';
import type { Store } from '../store/db';

const SETTING = 'github.token';

/** GitHub tokens look like github_pat_… (fine-grained) or ghp_… (classic). */
export function looksLikeGithubToken(token: string): boolean {
  return /^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,})$/.test(token.trim());
}

export function saveGithubToken(store: Store, token: string | undefined): Result<{ hasToken: boolean }, 'invalid-token'> {
  if (token === undefined || token.trim() === '') {
    store.index.setSetting(SETTING, '');
    return ok({ hasToken: false });
  }
  if (!looksLikeGithubToken(token)) return fail('invalid-token', 'That does not look like a GitHub token (github_pat_… or ghp_…)');
  store.index.setSetting(SETTING, encryptSecret(workspaceKey(store.home), token.trim()));
  return ok({ hasToken: true });
}

export function hasGithubToken(store: Store): boolean {
  return Boolean(store.index.getSetting(SETTING));
}

/** The decrypted token, for one push. Never log it. */
export function githubToken(store: Store): string | undefined {
  const sealed = store.index.getSetting(SETTING);
  if (!sealed) return undefined;
  const plain = decryptSecret(workspaceKey(store.home), sealed);
  return plain.ok ? plain.value : undefined;
}

// The optional GitHub token, only for reading CI results on the Handoff page (task R8; read-back in R6).
// A fine-grained personal access token with Actions: read on the one repository is enough (least privilege).
// Pushing uses the user's own git credentials. Stored encrypted in the user config folder, never shown.
import { fail, ok, type Result } from '../result';
import { decryptSecret, encryptSecret, workspaceKey } from '../settings/secrets';
import { setUserSetting, userSetting } from '../settings/user-dir';
import type { Store } from '../store/db';

const SETTING = 'github.token';

/** GitHub tokens look like github_pat_… (fine-grained) or ghp_… (classic). */
export function looksLikeGithubToken(token: string): boolean {
  return /^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,})$/.test(token.trim());
}

export function saveGithubToken(store: Store, token: string | undefined): Result<{ hasToken: boolean }, 'invalid-token'> {
  if (token === undefined || token.trim() === '') {
    setUserSetting(store.user, SETTING, undefined);
    return ok({ hasToken: false });
  }
  if (!looksLikeGithubToken(token)) return fail('invalid-token', 'That does not look like a GitHub token (github_pat_… or ghp_…)');
  setUserSetting(store.user, SETTING, encryptSecret(workspaceKey(store.user), token.trim()));
  return ok({ hasToken: true });
}

export function hasGithubToken(store: Store): boolean {
  return typeof userSetting(store.user, SETTING) === 'string';
}

/** The decrypted token, for one push. Never log it. */
export function githubToken(store: Store): string | undefined {
  const sealed = userSetting(store.user, SETTING);
  if (typeof sealed !== 'string' || !sealed) return undefined;
  const plain = decryptSecret(workspaceKey(store.user), sealed);
  return plain.ok ? plain.value : undefined;
}

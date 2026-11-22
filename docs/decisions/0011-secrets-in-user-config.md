---
id: ADR-0011
project: PRJ-0001
template: decision-record@1
status: accepted
date: 2026-11-22
change: CR-0004
---

# Secrets and personal settings in the user config folder

## Decision

API keys, provider connections (base URL, Azure endpoint and deployment), the model per task, the default author name and any optional GitHub token for CI results are stored in the user config folder: `$XDG_CONFIG_HOME/keel` or `~/.config/keel`, overridden by `KEEL_USER_DIR`.

- `settings.json` holds the settings, with keys encrypted (AES-256-GCM, as today in `src/lib/settings/secrets.ts`).
- `secret.key` holds the encryption key, owner read and write only.

Nothing in this folder is ever copied into a project folder, a document, git or a log.

## Reason

The project folder is committed and shared. Keys belong to the person, not the project, and the same keys serve every folder.

## Options considered

- **OS keychain** (for example `@napi-rs/keyring`): better, but adds a native dependency. In Next on the roadmap; the encrypted file stays as the fallback.
- **`.env` in the project:** rejected; too easy to commit.

## Consequences

- `keel.db` settings move to `settings.json`; the existing encrypted values are re-encrypted with the user key on first run if an old `~/.keel/secret.key` exists, otherwise the user enters keys again.
- Settings shows which values are per user and which are per project.

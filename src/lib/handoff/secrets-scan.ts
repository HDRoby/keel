// Scans the handoff package for keys and tokens before it is written (Security baseline v2, rule 1).
// A finding names the file, line and kind of secret, never the secret itself.

export interface SecretFinding {
  path: string;
  line: number;
  kind: string;
}

const PATTERNS: { kind: string; pattern: RegExp }[] = [
  { kind: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { kind: 'OpenAI API key', pattern: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/ },
  { kind: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { kind: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'Private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { kind: 'Key or token assignment', pattern: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9/+_=-]{24,}/i },
];

/** Findings in text files. `known` are the actual stored secrets; any occurrence of one is a finding too. */
export function scanForSecrets(files: { path: string; text: string }[], known: string[] = []): SecretFinding[] {
  const secrets = known.filter((k) => k.length >= 8);
  const findings: SecretFinding[] = [];
  for (const { path, text } of files) {
    text.split('\n').forEach((content, i) => {
      for (const { kind, pattern } of PATTERNS) if (pattern.test(content)) findings.push({ path, line: i + 1, kind });
      if (secrets.some((s) => content.includes(s))) findings.push({ path, line: i + 1, kind: 'Stored credential' });
    });
  }
  return findings;
}

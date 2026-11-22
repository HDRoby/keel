// Keys typed in the chat (CR-0016): a message that looks like a key is held before it is sent. It is never sent to a
// model and never written to a discussion file (Security baseline v2).

const PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/,                                   // OpenAI, Anthropic
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,                              // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,                                      // AWS access key
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,                            // Slack
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api[_ -]?key|key|token|secret|password|passwd)\b["']?\s*(?:[:=]|is)?\s*["']?(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/_-]{24,}={0,2})/i,
];

/** True when the text holds something that looks like a key or token. */
export function looksLikeKey(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export const KEY_HELD = 'This looks like a key. Keel will not send or save it.';

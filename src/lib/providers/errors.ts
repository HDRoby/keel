// Plain reasons for a failed model call, for the brainstorm and Settings. Built only from the HTTP status and
// Keel's own wording, never from the provider's message, so a key or prompt can never end up on screen.
import { PROVIDERS, ProviderError, type RealProviderId } from './types';

const label = (id: RealProviderId) => PROVIDERS.find((p) => p.id === id)?.label ?? id;

export function describeProviderError(provider: RealProviderId, error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : undefined;
  const name = label(provider);
  // The provider's text is read to pick Keel's wording, never shown.
  const raw = error instanceof Error ? error.message : '';
  if (/credit balance is too low|insufficient_quota|billing/i.test(raw)) {
    return provider === 'anthropic'
      ? 'Anthropic accepted the key, but the account has no credit left. Add credits under Plans & Billing at console.anthropic.com.'
      : `${name} accepted the key, but the account has no credit or quota left. Check billing with ${name}.`;
  }
  switch (status) {
    case 401: return `${name} rejected the API key (401). Check the key in Settings.`;
    case 403: return `${name} refused the request (403): the key has no access to this model or feature.`;
    case 404: return `${name} does not know this model (404). Check the model name under Model per task.`;
    case 429: return `${name} is rate limiting or the account is out of credit (429). Try again later.`;
    case 529: return `${name} is overloaded (529). Try again in a moment.`;
    default:
      if (status && status >= 500) return `${name} had a server error (${status}). Try again in a moment.`;
      if (status && status >= 400) return `${name} rejected the request (${status}).`;
      return `${name} could not be reached. Check the network, and the base URL or endpoint in Settings.`;
  }
}

/** A reason to refuse a pasted key that is clearly not for this provider, or undefined when it looks right. */
export function checkApiKey(provider: RealProviderId, key: string): string | undefined {
  const k = key.trim();
  if (!k) return undefined;
  if (/\s/.test(k)) return 'The key contains spaces or line breaks; paste it again.';
  if (provider === 'anthropic' && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) return 'Anthropic API keys start with "sk-ant-". Create one at console.anthropic.com under API keys.';
  if (provider === 'openai' && !/^sk-[A-Za-z0-9_-]{20,}$/.test(k)) return 'OpenAI API keys start with "sk-". Create one at platform.openai.com under API keys.';
  return undefined;
}

// Provider layer contract (REQ-009, task T3).

export type ProviderId = 'ollama' | 'anthropic' | 'openai' | 'azure-openai' | 'openai-compatible' | 'fake';

/** Providers a user can choose in Settings. */
export type RealProviderId = Exclude<ProviderId, 'fake'>;

export const PROVIDERS: { id: RealProviderId; label: string }[] = [
  { id: 'ollama', label: 'Ollama (on this computer)' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'azure-openai', label: 'Azure OpenAI' },
  { id: 'openai-compatible', label: 'Other OpenAI-compatible server' },
];

/** The ids of PROVIDERS, as a tuple for z.enum. */
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [RealProviderId, ...RealProviderId[]];

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatProvider {
  readonly id: ProviderId;
  /** Streams the reply as text chunks. Must never log message content or keys. */
  stream(messages: ChatMessage[], options: ChatOptions): AsyncIterable<string>;
}

/** Connection settings for one provider. The key is only ever held decrypted in memory. */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;      // ollama: the server, e.g. http://localhost:11434; openai-compatible: e.g. http://host/v1
  endpoint?: string;     // azure-openai, e.g. https://<resource>.openai.azure.com
  deployment?: string;   // azure-openai
  apiVersion?: string;   // azure-openai
}

/** The tasks that can each use a different model (Settings › Model per task). */
export type ModelTask = 'brainstorm' | 'documents' | 'feasibility';

export const MODEL_TASKS: { task: ModelTask; label: string }[] = [
  { task: 'brainstorm', label: 'Section comments' },
  { task: 'documents', label: 'Spec and plan' },
  { task: 'feasibility', label: 'Feasibility review' },
];

/** The tasks of MODEL_TASKS, as a tuple for z.enum. */
export const MODEL_TASK_IDS = MODEL_TASKS.map((t) => t.task) as [ModelTask, ...ModelTask[]];

export interface ModelChoice {
  provider: RealProviderId;
  model: string;
}

/** Raised by adapters when a provider declines or fails. Carries no message content or keys. */
export class ProviderError extends Error {
  constructor(readonly provider: ProviderId, readonly reason: 'refused' | 'failed', message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

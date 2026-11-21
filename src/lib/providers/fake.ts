// Scripted provider for tests (KEEL_PROVIDER=fake). Says which provider it stands in for.
import { PROVIDERS, type ChatMessage, type ChatProvider, type RealProviderId } from './types';

export function fakeReply(standsFor: RealProviderId, messages: ChatMessage[]): string {
  const label = PROVIDERS.find((p) => p.id === standsFor)?.label ?? standsFor;
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  return `Reply from ${label}: I read "${last}".`;
}

export function createFakeProvider(standsFor: RealProviderId): ChatProvider {
  return {
    id: 'fake',
    async *stream(messages) {
      for (const word of fakeReply(standsFor, messages).split(/(?<= )/)) yield word;
    },
  };
}

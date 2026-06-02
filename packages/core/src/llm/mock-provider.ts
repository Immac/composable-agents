/**
 * Mock LLM Provider — returns canned responses for testing.
 */

import type { LLMProvider, LLMResponse, LLMChunk } from '../types/index.ts';

export interface MockResponse {
  content?: string;
  model?: string;
  delay?: number;
  shouldAbort?: boolean;
}

export class MockProvider implements LLMProvider {
  readonly id = 'mock';
  private responses: MockResponse[];
  private callCount = 0;

  constructor(defaultResponse?: string | MockResponse) {
    this.responses = defaultResponse
      ? [typeof defaultResponse === 'string' ? { content: defaultResponse } : defaultResponse]
      : [{ content: '[Mock response]' }];
  }

  /** Queue additional responses for subsequent calls */
  addResponse(response: MockResponse | string): void {
    this.responses.push(
      typeof response === 'string' ? { content: response } : response,
    );
  }

  /** How many times generate() has been called */
  getCallCount(): number {
    return this.callCount;
  }

  async generate(
    _systemPrompt: string,
    _userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    if (signal?.aborted) {
      return { content: '', model: 'mock' };
    }

    this.callCount++;
    const idx = Math.min(this.callCount - 1, this.responses.length - 1);
    const resp = this.responses[idx] ?? this.responses[0]!;

    if (resp.delay) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, resp.delay);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    }

    if (resp.shouldAbort) {
      return { content: '', model: 'mock' };
    }

    return {
      content: resp.content ?? '',
      model: resp.model ?? 'mock-model',
      usage: { promptTokens: 10, completionTokens: 20 },
    };
  }

  async *stream(
    _systemPrompt: string,
    _userPrompt: string,
    signal?: AbortSignal,
  ): AsyncIterable<LLMChunk> {
    if (signal?.aborted) return;

    const content = this.responses[0]?.content ?? '';
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) return;
      yield { content: words[i] + ' ', done: false };
    }
    yield { content: '', done: true };
  }
}

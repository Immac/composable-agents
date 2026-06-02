import { describe, it, expect } from 'vitest';
import { MockProvider } from '../../src/llm/mock-provider.ts';

describe('MockProvider', () => {
  it('returns canned response', async () => {
    const provider = new MockProvider('Hello');
    const result = await provider.generate('sys', 'usr');
    expect(result.content).toBe('Hello');
  });

  it('cycles through multiple responses', async () => {
    const provider = new MockProvider('First');
    provider.addResponse('Second');
    const r1 = await provider.generate('', '');
    const r2 = await provider.generate('', '');
    expect(r1.content).toBe('First');
    expect(r2.content).toBe('Second');
  });

  it('tracks call count', async () => {
    const provider = new MockProvider();
    await provider.generate('', '');
    await provider.generate('', '');
    expect(provider.getCallCount()).toBe(2);
  });

  it('respects pre-aborted signal', async () => {
    const provider = new MockProvider('Should not return');
    const ac = new AbortController();
    ac.abort();
    const result = await provider.generate('', '', ac.signal);
    expect(result.content).toBe('');
  });
});

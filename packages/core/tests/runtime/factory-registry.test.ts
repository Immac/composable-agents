import { describe, it, expect } from 'vitest';
import { createFactoryRegistry } from '../../src/runtime/factory-registry';
import type { Agent, AgentResult, ExecutionScope } from '../../src/types/index';

function createFakeAgent(id: string): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(): Promise<AgentResult> {
      return { status: 'success', output: `${id}-done` };
    },
  };
}

describe('FactoryRegistry', () => {
  it('registers and retrieves a factory', () => {
    const reg = createFactoryRegistry();
    const factory = (config: { id: string }) => createFakeAgent(config.id);
    reg.register('test-agent', factory);
    expect(reg.has('test-agent')).toBe(true);
    expect(reg.get('test-agent')).toBe(factory);
  });

  it('lists registered factories', () => {
    const reg = createFactoryRegistry();
    reg.register('alpha', () => createFakeAgent('alpha'));
    reg.register('beta', () => createFakeAgent('beta'));
    expect(reg.list()).toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(reg.list().length).toBe(2);
  });

  it('instantiates an agent from factory + config', async () => {
    const reg = createFactoryRegistry();
    reg.register('maker', (config: { name: string }) => createFakeAgent(config.name));
    const agent = await reg.instantiate({
      factory: 'maker',
      config: { name: 'my-instance' },
    });
    expect(agent.id).toBe('my-instance');
  });

  it('respects the `as` field for instance ID', async () => {
    const reg = createFactoryRegistry();
    reg.register('maker', (config: { id: string; name: string }) => ({
      ...createFakeAgent(config.id),
      // Simulate the factory using config.id
    }));
    const agent = await reg.instantiate({
      factory: 'maker',
      as: 'overridden-id',
      config: { name: 'test' },
    });
    // The config.id is set from `as` by the registry
    expect(agent.id).toBe('overridden-id');
  });

  it('throws for unregistered factory', async () => {
    const reg = createFactoryRegistry();
    await expect(reg.instantiate({ factory: 'nonexistent' })).rejects.toThrow(
      'Factory "nonexistent" not registered',
    );
  });

  it('supports dependency injection per factory', async () => {
    const reg = createFactoryRegistry();
    const deps = { prefix: 'dep-' };
    reg.register(
      'with-deps',
      (config: { id: string }, injectedDeps?: { prefix: string }) => {
        return createFakeAgent(injectedDeps!.prefix + config.id);
      },
      deps,
    );

    const agent = await reg.instantiate({
      factory: 'with-deps',
      config: { id: 'test' },
    });
    expect(agent.id).toBe('dep-test');
  });

  it('attaches triggers from declaration to agent manifest', async () => {
    const reg = createFactoryRegistry();
    reg.register('trigger-me', (config: { id: string }) => createFakeAgent(config.id));

    const agent = await reg.instantiate({
      factory: 'trigger-me',
      as: 'triggered-agent',
      config: { id: 'ignored' },
      triggers: [{ when: "cabinet.exists('x')" }, { when: "cabinet.get('y') > 5" }],
    });

    const triggers = (agent.manifest as any).triggers;
    expect(triggers).toBeDefined();
    expect(triggers.length).toBe(2);
    expect(triggers[0].when).toBe("cabinet.exists('x')");
  });

  it('allows re-registration', () => {
    const reg = createFactoryRegistry();
    reg.register('x', () => createFakeAgent('a'));
    // Should warn but not throw
    reg.register('x', () => createFakeAgent('b'));
    expect(reg.has('x')).toBe(true);
  });
});

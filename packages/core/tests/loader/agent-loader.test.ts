import { describe, it, expect } from 'vitest';
import { loadAgent, serializeAgent, validateAgentManifest, AgentRegistry } from '../../src/loader/agent-loader';
import type { Agent, AgentManifest } from '../../src/types/index';

describe('validateAgentManifest', () => {
  it('accepts a valid LLM agent', () => {
    const errors = validateAgentManifest({
      id: 'test-agent',
      type: 'llm',
      purpose: 'Testing',
      llm: { prompt_template: './prompt.md' },
      learning: { channels: [] },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid code agent', () => {
    const errors = validateAgentManifest({
      id: 'test-code',
      type: 'code',
      purpose: 'Testing',
      code: { entrypoint: './index.ts' },
      learning: { channels: [] },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid composite agent', () => {
    const errors = validateAgentManifest({
      id: 'test-composite',
      type: 'composite',
      purpose: 'Testing',
      pipeline: [{ agent: 'sub-agent' }],
      learning: { channels: [] },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects missing id', () => {
    const errors = validateAgentManifest({
      type: 'llm',
      purpose: 'test',
      llm: { prompt_template: './p.md' },
      learning: { channels: [] },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('rejects missing type', () => {
    const errors = validateAgentManifest({
      id: 'test',
      purpose: 'test',
      learning: { channels: [] },
    });
    expect(errors.some((e) => e.includes('type'))).toBe(true);
  });

  it('rejects llm agent without llm config', () => {
    const errors = validateAgentManifest({
      id: 'test', type: 'llm', purpose: 'test',
      learning: { channels: [] },
    });
    expect(errors.some((e) => e.includes('llm'))).toBe(true);
  });

  it('rejects missing learning field', () => {
    const errors = validateAgentManifest({
      id: 'test', type: 'code', purpose: 'test',
      code: { entrypoint: './x.ts' },
    });
    expect(errors.some((e) => e.includes('learning'))).toBe(true);
  });
});

describe('AgentRegistry', () => {
  it('registers and retrieves agents', () => {
    const registry = new AgentRegistry();
    const agent = { id: 'test', manifest: { id: 'test', type: 'code' as const, version: '0.1.0', purpose: 'test', learning: { channels: [] } } } as Agent;
    registry.register(agent);
    expect(registry.get('test')).toBe(agent);
  });

  it('checks existence', () => {
    const registry = new AgentRegistry();
    expect(registry.has('missing')).toBe(false);
  });

  it('lists all agent IDs', () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'a' } as Agent);
    registry.register({ id: 'b' } as Agent);
    expect(registry.ids()).toEqual(['a', 'b']);
  });
});

const validManifest: Record<string, unknown> = {
  id: 'test-agent',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Testing',
  llm: { prompt_template: './prompt.md' },
  learning: { channels: [] },
};

describe('loadAgent', () => {
  it('loads from a direct object', () => {
    const result = loadAgent(validManifest);
    expect(result.manifest.id).toBe('test-agent');
    expect(result.filePath).toBe('(inline)');
  });

  it('loads from inline JSON string', () => {
    const json = JSON.stringify(validManifest);
    const result = loadAgent(json);
    expect(result.manifest.id).toBe('test-agent');
  });

  it('loads from inline YAML string', () => {
    const yaml = `id: yaml-agent
type: llm
version: '0.1.0'
purpose: Testing
llm:
  prompt_template: ./prompt.md
learning:
  channels: []`;
    const result = loadAgent(yaml);
    expect(result.manifest.id).toBe('yaml-agent');
  });

  it('throws on .ts/.js file paths', () => {
    expect(() => loadAgent('agent.ts')).toThrow('Cannot load .ts/.js');
  });

  it('throws on unknown format', () => {
    expect(() => loadAgent('not-a-known-format')).toThrow('Cannot detect format');
  });

  it('validates the loaded manifest', () => {
    const bad = { id: 'x', type: 'llm' };
    expect(() => loadAgent(bad)).toThrow('Validation errors');
  });
});

describe('serializeAgent', () => {
  const manifest: AgentManifest = {
    id: 'test',
    type: 'llm',
    version: '0.1.0',
    purpose: 'Test agent',
    llm: { prompt_template: './p.md' },
    learning: { channels: [] },
  };

  it('serializes to JSON', () => {
    const json = serializeAgent(manifest, 'json');
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe('test');
    expect(parsed.type).toBe('llm');
  });

  it('serializes to YAML by default', () => {
    const yaml = serializeAgent(manifest);
    expect(yaml).toContain('id: test');
    expect(yaml).toContain('type: llm');
  });

  it('round-trips YAML → load → serialize → load', () => {
    const yaml = serializeAgent(manifest);
    const loaded = loadAgent(yaml);
    expect(loaded.manifest.id).toBe(manifest.id);
    expect(loaded.manifest.type).toBe(manifest.type);
  });

  it('round-trips JSON → load → serialize → load', () => {
    const json = serializeAgent(manifest, 'json');
    const loaded = loadAgent(json);
    expect(loaded.manifest.id).toBe(manifest.id);
  });
});

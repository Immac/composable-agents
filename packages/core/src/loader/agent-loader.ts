/**
 * Agent Loader — loads agent definitions from YAML, JSON, or TypeScript objects.
 *
 * The internal representation is always AgentManifest (a plain object).
 * Format detection is automatic based on file extension or input type.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import type { AgentManifest, Agent } from '../types/index.ts';

export type AgentSource = string | Record<string, unknown>;
export type OutputFormat = 'yaml' | 'json';

export interface LoadResult {
  manifest: AgentManifest;
  filePath: string;
}

export interface LoadError {
  filePath: string;
  errors: string[];
}

/**
 * Load an agent definition from a file path or inline object.
 *
 * Format detection:
 *   - string ending in .yaml/.yml → YAML
 *   - string ending in .json → JSON
 *   - string ending in .ts/.js → error (use import, not load)
 *   - object → use directly
 */
export function loadAgent(source: AgentSource, filePath?: string): LoadResult {
  let raw: Record<string, unknown>;
  let resolvedPath = filePath || '(inline)';

  if (typeof source === 'object') {
    // Direct object — use as-is
    raw = source;
  } else if (typeof source === 'string') {
    const trimmed = source.trim();

    // Detect if it's a file path or raw content
    if (trimmed.endsWith('.yaml') || trimmed.endsWith('.yml')) {
      resolvedPath = resolve(trimmed);
      if (!existsSync(resolvedPath)) {
        throw new Error(`Agent file not found: ${resolvedPath}`);
      }
      const content = readFileSync(resolvedPath, 'utf-8');
      raw = parseYAMLContent(content, resolvedPath);
    } else if (trimmed.endsWith('.json')) {
      resolvedPath = resolve(trimmed);
      if (!existsSync(resolvedPath)) {
        throw new Error(`Agent file not found: ${resolvedPath}`);
      }
      const content = readFileSync(resolvedPath, 'utf-8');
      raw = parseJSONContent(content, resolvedPath);
    } else if (trimmed.endsWith('.ts') || trimmed.endsWith('.js')) {
      throw new Error(
        `Cannot load .ts/.js files directly. Import the module and pass the object to loadAgent().\n` +
        `File: ${trimmed}`
      );
    } else if (trimmed.startsWith('{')) {
      // Raw JSON string
      raw = parseJSONContent(trimmed, '(inline JSON)');
    } else if (trimmed.startsWith('name:') || trimmed.startsWith('id:')) {
      // Raw YAML string (heuristic: starts with a common YAML key)
      raw = parseYAMLContent(trimmed, '(inline YAML)');
    } else {
      throw new Error(
        `Cannot detect format for: ${trimmed.slice(0, 50)}...\n` +
        `Use .yaml, .json, or pass an object directly.`
      );
    }
  } else {
    throw new Error(`Invalid agent source: expected string path or object, got ${typeof source}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid agent definition in ${resolvedPath} — expected an object`);
  }

  const errors = validateAgentManifest(raw);
  if (errors.length > 0) {
    throw new Error(`Validation errors in ${resolvedPath}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return { manifest: raw as AgentManifest, filePath: resolvedPath };
}

/** Backward-compatible alias */
export const loadAgentYaml = loadAgent;

function parseYAMLContent(content: string, source: string): Record<string, unknown> {
  const raw = parseYAML(content);
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid YAML in ${source} — expected an object`);
  }
  return raw;
}

function parseJSONContent(content: string, source: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid JSON in ${source} — expected an object`);
    }
    return raw;
  } catch (err: any) {
    if (err.message.includes('Invalid JSON')) throw err;
    throw new Error(`JSON parse error in ${source}: ${err.message}`);
  }
}

// ── Serialization ─────────────────────────────────────────────

/**
 * Serialize an AgentManifest to a string.
 */
export function serializeAgent(manifest: AgentManifest, format: OutputFormat = 'yaml'): string {
  if (format === 'json') {
    return JSON.stringify(manifest, null, 2) + '\n';
  }
  return stringifyYAML(manifest, { lineWidth: 100, noRefs: true });
}

export function validateAgentManifest(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!raw.id || typeof raw.id !== 'string') {
    errors.push('Missing required field: id (string)');
  }
  if (!raw.type || !['llm', 'code', 'composite'].includes(raw.type as string)) {
    errors.push('Missing or invalid field: type (must be "llm", "code", or "composite")');
  }
  if (!raw.purpose || typeof raw.purpose !== 'string') {
    errors.push('Missing required field: purpose (string)');
  }

  // Type-specific validations
  const type = raw.type as string;
  if (type === 'llm' && !raw.llm) {
    errors.push('Type "llm" requires an "llm" config block with prompt_template');
  }
  if (type === 'code' && !raw.code) {
    errors.push('Type "code" requires a "code" config block with entrypoint');
  }
  if (type === 'composite' && !raw.pipeline) {
    errors.push('Type "composite" requires a "pipeline" config block');
  }

  // learning.channels is required but can be empty
  if (!raw.learning) {
    errors.push('Missing required field: learning (can be { channels: [] })');
  } else if (typeof raw.learning !== 'object') {
    errors.push('Field "learning" must be an object');
  } else {
    const learning = raw.learning as Record<string, unknown>;
    if (!Array.isArray(learning.channels)) {
      errors.push('Field "learning.channels" must be an array');
    }
  }

  return errors;
}

/**
 * Simple agent registry — resolves agent IDs to Agent instances.
 * For MVP, agents are registered programmatically.
 */
export class AgentRegistry {
  private agents = new Map<string, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  registerAll(agents: Agent[]): void {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): Agent[] {
    return Array.from(this.agents.values());
  }

  ids(): string[] {
    return Array.from(this.agents.keys());
  }
}

/**
 * Agent YAML Loader — parses agent.yaml files into AgentManifest objects.
 *
 * Validates against the expected schema and provides clear error messages.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse } from 'yaml';
import type { AgentManifest, Agent } from '../types/index.ts';

export interface LoadResult {
  manifest: AgentManifest;
  filePath: string;
}

export interface LoadError {
  filePath: string;
  errors: string[];
}

export function loadAgentYaml(filePath: string): LoadResult {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Agent file not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const raw = parse(content);

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid agent file: ${resolvedPath} — expected a YAML object`);
  }

  const errors = validateAgentManifest(raw);
  if (errors.length > 0) {
    throw new Error(`Validation errors in ${resolvedPath}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const manifest = raw as AgentManifest;

  return { manifest, filePath: resolvedPath };
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

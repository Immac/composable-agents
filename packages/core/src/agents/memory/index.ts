/**
 * Memory Agent — stub for persistent memory.
 *
 * Type: System (code), declarative only for MVP
 * Purpose: Handle "remember this" requests by persisting to AGENTS.md.
 * Learning channels: none
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope } from '../../types/index.ts';

export const memoryAgentManifest: AgentManifest = {
  id: 'memory-agent',
  type: 'code',
  version: '0.1.0',
  purpose: 'Persistent memory for user "remember" requests',
  learning: { channels: [] },
};

export const memoryAgent: Agent = {
  id: 'memory-agent',
  manifest: memoryAgentManifest,

  async execute(context: ExecutionScope, _signal?: AbortSignal): Promise<AgentResult> {
    // MVP stub — no-op
    return { status: 'success', output: 'Memory agent: no persistence configured.' };
  },
};

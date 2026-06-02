/**
 * Reflexes Agent — condition-action rule evaluation.
 *
 * Type: System (code)
 * Purpose: React instantly to specific conditions at configured timing points.
 * Learning channels: apply-immediately (accepts new reflex rules from Learning Agent)
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope } from '../../types/index.ts';

export const reflexesAgentManifest: AgentManifest = {
  id: 'reflexes-agent',
  type: 'code',
  version: '0.1.0',
  purpose: 'Condition-action matching at configurable timing points',
  learning: {
    channels: [{ type: 'apply-immediately', handler: async () => {} }],
  },
};

export const reflexesAgent: Agent = {
  id: 'reflexes-agent',
  manifest: reflexesAgentManifest,

  async execute(context: ExecutionScope, _signal?: AbortSignal): Promise<AgentResult> {
    // The reflexes agent evaluates reflexes from the context's blackboard
    // and runs their handlers. In the new architecture, reflexes are managed
    // by the ReflexEngine at the Controller level, not by individual agents.
    //
    // This agent serves as a pipeline step marker and for any reflex-related
    // post-processing that needs to happen in-band.

    const warnings = context.blackboard.warnings;
    if (warnings.length > 0) {
      return {
        status: 'success',
        output: `Processed ${warnings.length} warnings. No reflex actions triggered in-band.`,
      };
    }

    return { status: 'success', output: 'No warnings to process.' };
  },
};

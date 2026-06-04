/**
 * Foreman Agent — pipeline orchestrator with approval loop.
 *
 * Type: foreman
 * Purpose: Run a pipeline of agents, check scores, revise, loop until approved.
 *
 * A Foreman IS an agent — same execute(scope) contract.
 * It replaces bespoke runner scripts by formalizing the orchestration pattern.
 *
 * What it does:
 *   1st pass:  run pipeline agents in sequence
 *   Loop:      run critics → read cabinet scores → check approval gates
 *              → [run revision agents] → repeat
 *   Plateau:   detect score stagnation → exit with best result
 *   Done:      scores and product cabinet keys in AgentResult.output
 *
 * The caller handles file I/O (read from cabinet, write to disk).
 */

import type {
  Agent,
  AgentManifest,
  AgentResult,
  ExecutionScope,
  ForemanConfig,
  ForemanCycle,
  Cabinet,
  FactoryRegistry,
} from '../../types/index.ts';

export const foremanAgentManifest: AgentManifest = {
  id: 'foreman',
  type: 'foreman',
  version: '0.1.0',
  purpose: 'Multi-cycle pipeline orchestration with approval gates',
  learning: {
    channels: [],
  },
};

export interface ForemanOptions {
  resolveAgent: (id: string) => Agent | undefined;
  /** Optional factory registry for parameterized agent creation */
  factoryRegistry?: FactoryRegistry;
}

function defaultConfig(cfg?: ForemanConfig): Required<ForemanConfig> {
  return {
    pipeline: cfg?.pipeline ?? [],
    critics: cfg?.critics ?? [],
    revision: cfg?.revision ?? [],
    approval: cfg?.approval ?? [],
    maxCycles: cfg?.maxCycles ?? 10,
    plateauWindow: cfg?.plateauWindow ?? 3,
    products: cfg?.products ?? [],
    scoreHistoryKey: cfg?.scoreHistoryKey ?? 'foreman/scores',
  };
}

function readScore(cabinet: Cabinet, source: string): number {
  const val = cabinet.get<number>(source);
  if (typeof val === 'number') return val;
  const obj = cabinet.get<Record<string, unknown>>(source);
  if (obj && typeof obj.score === 'number') return obj.score;
  return 0;
}

function detectPlateau(scores: number[], window: number): boolean {
  if (scores.length < window + 1) return false;
  const recent = scores.slice(-window);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] > recent[i - 1]) return false;
  }
  return true;
}

export function createForemanAgent(options: ForemanOptions): Agent {
  return {
    id: 'foreman',
    manifest: foremanAgentManifest,

    async execute(
      context: ExecutionScope,
      signal?: AbortSignal,
    ): Promise<AgentResult> {
      // Config: check cabinet first (set externally), then fallback
      const cabCfg = context.cabinet.get<ForemanConfig>('foreman/config');
      const resolved = defaultConfig(cabCfg);

      if (resolved.pipeline.length === 0) {
        return { status: 'failed', error: 'Foreman: empty pipeline in config' };
      }

      const scoreHistory: ForemanCycle[] = [];
      const scoresByCycle: number[] = [];

      async function runAgent(id: string, phase: string): Promise<boolean> {
        if (signal?.aborted) return false;
        const agent = options.resolveAgent(id);
        if (!agent) {
          return false;
        }
        try {
          const t = Date.now();
          const result = await agent.execute(context, signal);
          const elapsed = ((Date.now() - t) / 1000).toFixed(1);
          return result.status === 'success';
        } catch {
          return false;
        }
      }

      // ===== 1st Pass: run pipeline agents in sequence =====
      for (const step of resolved.pipeline) {
        if (signal?.aborted) return { status: 'aborted' };

        if (step.waitFor && step.waitFor.length > 0) {
          const missing = step.waitFor.filter((k) => !context.cabinet.exists(k));
          if (missing.length > 0) continue;
        }

        // Resolve agent: factory-declared or explicitly-named
        let agent: Agent | undefined;

        if (step.factory && options.factoryRegistry) {
          try {
            agent = await options.factoryRegistry.instantiate({
              factory: step.factory,
              as: step.as,
              config: step.factoryConfig,
            });
            // Register temporarily for the Foreman's resolution
            if (agent) {
              // Wrap resolveAgent temporarily for this step
              const originalResolve = options.resolveAgent;
              options.resolveAgent = (id: string) => {
                if (id === (step.as ?? step.factory)) return agent;
                return originalResolve(id);
              };
            }
          } catch (e) {
            process.stderr.write(`    ⚠ factory instantiation failed: ${e}
`);
          }
        }

        if (step.agent) {
          await runAgent(step.agent, 'pipeline');
        } else if (agent) {
          // For factory-only steps, run the instantiated agent directly
          const id = step.as ?? step.factory!;
          if (signal?.aborted) return { status: 'aborted' };
          const t = Date.now();
          try {
            const result = await agent.execute(context, signal);
            const elapsed = ((Date.now() - t) / 1000).toFixed(1);
            process.stderr.write(`    pipeline: ${id} — ${result.status} (${elapsed}s)
`);
          } catch (e) {
            process.stderr.write(`    pipeline: ${id} — error: ${e}
`);
          }
        }
      }

      // ===== Approval Loop =====
      for (let cycle = 1; cycle <= resolved.maxCycles; cycle++) {
        if (signal?.aborted) break;

        // Run critics
        for (const criticId of resolved.critics) {
          if (signal?.aborted) break;
          await runAgent(criticId, 'critic');
        }

        // Read scores from cabinet
        const cycleScores: Record<string, number> = {};
        for (const gate of resolved.approval) {
          cycleScores[gate.source] = readScore(context.cabinet, gate.source);
        }

        // Average for plateau tracking
        const vals = Object.values(cycleScores);
        const avgScore = vals.length > 0
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : 0;
        scoresByCycle.push(avgScore);

        const cycleRecord: ForemanCycle = {
          cycle,
          scores: cycleScores,
          timestamp: Date.now(),
          status: 'pending',
        };
        scoreHistory.push(cycleRecord);
        context.cabinet.put(resolved.scoreHistoryKey, scoreHistory);

        // Check approval gates
        const failedGates = resolved.approval.filter(
          (g) => (cycleScores[g.source] ?? 0) < g.min,
        );

        if (failedGates.length === 0) {
          cycleRecord.status = 'approved';
          context.cabinet.put('foreman/status', { status: 'approved', cycle, scores: cycleScores });
          return {
            status: 'success',
            output: JSON.stringify({
              cycle,
              scores: cycleScores,
              products: resolved.products.map((p) => ({
                key: p.cabinetKey,
                path: p.outputPath,
              })),
              approved: true,
            }),
          };
        }

        // Plateau detection
        if (detectPlateau(scoresByCycle, resolved.plateauWindow)) {
          if (cycle >= resolved.plateauWindow + 1) {
            cycleRecord.status = 'plateau';
            context.cabinet.put('foreman/plateau', { cycle, scores: cycleScores });

            if (cycle >= Math.ceil(resolved.maxCycles / 2)) {
              context.cabinet.put('foreman/status', {
                status: 'plateau', cycle, scores: cycleScores,
              });
              return {
                status: 'success',
                output: JSON.stringify({
                  cycle,
                  scores: cycleScores,
                  products: resolved.products.map((p) => ({
                    key: p.cabinetKey,
                    path: p.outputPath,
                  })),
                  plateau: true,
                  approved: false,
                }),
              };
            }
          }
        }

        // Run revision agents
        if (resolved.revision.length > 0) {
          for (const revId of resolved.revision) {
            if (signal?.aborted) break;
            await runAgent(revId, 'revision');
          }
        } else {
          // No revision agents — accept current state
          context.cabinet.put('foreman/status', {
            status: 'accepted', cycle, scores: cycleScores,
          });
          return {
            status: 'success',
            output: JSON.stringify({
              cycle,
              scores: cycleScores,
              products: resolved.products.map((p) => ({
                key: p.cabinetKey,
                path: p.outputPath,
              })),
              forced: true,
              approved: false,
            }),
          };
        }
      }

      // Max cycles
      context.cabinet.put('foreman/status', { status: 'max-cycles', scores: scoresByCycle });
      return {
        status: 'success',
        output: JSON.stringify({
          cycles: resolved.maxCycles,
          scores: {},
          products: resolved.products.map((p) => ({
            key: p.cabinetKey,
            path: p.outputPath,
          })),
          maxCycles: true,
          approved: false,
        }),
      };
    },
  };
}

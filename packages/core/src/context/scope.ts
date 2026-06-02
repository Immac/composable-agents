/**
 * ExecutionScope — combines blackboard + cabinet for a single agent execution.
 *
 * Supports snapshot/rollback.
 */

import type { ExecutionScope } from '../types/agent';
import { CabinetImpl } from './cabinet';
import { BlackboardImpl } from './blackboard';

export class Scope implements ExecutionScope {
  readonly agentId: string;
  readonly blackboard: BlackboardImpl;
  readonly cabinet: CabinetImpl;

  constructor(agentId: string, blackboard: BlackboardImpl, cabinet?: CabinetImpl) {
    this.agentId = agentId;
    this.blackboard = blackboard;
    this.cabinet = cabinet ?? new CabinetImpl();
  }

  /** Create a snapshot for potential rollback */
  snapshot(): string {
    return JSON.stringify({
      task: this.blackboard.task,
      warnings: this.blackboard.warnings,
      cabinet: this.serializeCabinet(),
    });
  }

  /** Roll back to a previous snapshot */
  rollback(key: string): void {
    try {
      const data = JSON.parse(key) as {
        task: { input: string; goal: string; status: string; output?: string; error?: string };
        warnings: string[];
        cabinet: Record<string, unknown>;
      };
      this.blackboard.task = structuredClone(data.task) as typeof this.blackboard.task;
      this.blackboard.warnings = structuredClone(data.warnings);
      this.cabinet.clear();
      if (data.cabinet) {
        for (const [k, v] of Object.entries(data.cabinet)) {
          this.cabinet.put(k, v);
        }
      }
    } catch {
      // Invalid snapshot — silently ignore
    }
  }

  /** Clone for scope isolation (parallel branches, composite children) */
  clone(agentId: string): Scope {
    return new Scope(agentId, this.blackboard.clone(), this.cabinet.clone());
  }

  private serializeCabinet(): Record<string, unknown> {
    const entries = this.cabinet.query('**');
    const result: Record<string, unknown> = {};
    for (const entry of entries) {
      result[entry.key] = entry.value;
    }
    return result;
  }
}

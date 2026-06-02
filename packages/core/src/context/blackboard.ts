/**
 * Blackboard — typed working state for a scope.
 *
 * Unlike Cabinet (arbitrary artifact storage), the blackboard has
 * typed fields with mutation methods. Conditions query it synchronously.
 */

import type {
  Blackboard,
  IdentityProfile,
  TaskState,
} from '../types/agent.ts';

export class BlackboardImpl implements Blackboard {
  identity: IdentityProfile;
  task: TaskState;
  warnings: string[];

  constructor(identity: IdentityProfile, taskInput: string, goal?: string) {
    this.identity = structuredClone(identity);
    this.task = {
      input: taskInput,
      goal: goal ?? taskInput,
      status: 'pending',
    };
    this.warnings = [];
  }

  setTaskStatus(status: TaskState['status']): void {
    this.task.status = status;
  }

  setTaskOutput(output: string): void {
    this.task.output = output;
    this.task.status = 'complete';
  }

  setTaskError(error: string): void {
    this.task.error = error;
    this.task.status = 'failed';
  }

  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  /** Clone for scope isolation */
  clone(): BlackboardImpl {
    const cloned = new BlackboardImpl(this.identity, this.task.input, this.task.goal);
    cloned.task = structuredClone(this.task);
    cloned.warnings = structuredClone(this.warnings);
    return cloned;
  }
}

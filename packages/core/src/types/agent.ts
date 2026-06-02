/**
 * Agent — the core abstraction.
 *
 * Everything that can be composed in this framework implements this interface.
 * A primitive agent (LLM or code) executes directly. A composite agent
 * delegates to a sub-pipeline.
 */

import type { Lesson } from './signal.ts';

export type AgentType = 'llm' | 'code' | 'composite';

export interface Agent {
  readonly id: string;
  readonly manifest: AgentManifest;

  execute(
    scope: ExecutionScope,
    signal?: AbortSignal,
  ): Promise<AgentResult>;
}

/**
 * The execution scope that an agent receives.
 * Contains the blackboard (typed working state) and cabinet (artifact storage).
 */
export interface ExecutionScope {
  readonly agentId: string;

  /** Typed working state — what is happening NOW */
  readonly blackboard: Blackboard;

  /** Namespaced artifact storage — what agents have STORED */
  readonly cabinet: Cabinet;

  /** Create a snapshot for potential rollback */
  snapshot(): string;

  /** Roll back to a previous snapshot */
  rollback(key: string): void;
}

/** Typed working state — shared across agents in a scope */
export interface Blackboard {
  identity: IdentityProfile;
  task: TaskState;
  warnings: string[];
}

export interface IdentityProfile {
  name: string;
  constraints: string[];
  values: string[];
  forbiddenTopics?: string[];
}

export interface TaskState {
  input: string;
  goal: string;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  output?: string;
  error?: string;
}

/**
 * Namespaced artifact storage.
 * Agents store arbitrary data here: drafts, images, logs, checkpoints.
 */
export interface Cabinet {
  put(key: string, value: unknown): void;
  get<T>(key: string): T | undefined;
  exists(key: string): boolean;
  query(pattern: string): CabinetEntry[];
  remove(key: string): void;
  clear(): void;
}

export interface CabinetEntry {
  key: string;
  value: unknown;
}

/**
 * AgentManifest — declaration of an agent's identity, capabilities,
 * deterministic checks, and learning channels.
 */
export interface AgentManifest {
  id: string;
  type: AgentType;
  version: string;
  purpose: string;

  /** Deterministic pre/post checks around the non-deterministic core */
  deterministic?: {
    pre_checks?: DeterministicCheck[];
    post_processing?: DeterministicCheck[];
  };

  /** LLM-specific config (only for type: llm) */
  llm?: {
    prompt_template: string;
    model?: string;
    temperature?: number;
  };

  /** Code-specific config (only for type: code) */
  code?: {
    entrypoint: string;
    timeout?: number;
  };

  /** Sub-pipeline (only for type: composite) */
  pipeline?: PipelineStep[];

  /** Communication contracts */
  communication?: {
    consumes?: string[];
    produces?: string[];
  };

  /** Learning channels — how this agent RECEIVES lessons */
  learning: {
    channels: LearningChannel[];
  };

  /** Teaching formats — what lesson types this agent can produce */
  teaches?: {
    formats: string[];
    preferredFormat?: string;
  };

  /** Visibility rules for composite agents */
  visibility?: VisibilityRules;
}

export interface DeterministicCheck {
  condition: string; // or Condition expression
  action: 'skip' | 'halt' | 'retry' | 'warn' | 'block';
  message?: string;
}

export interface LearningChannel {
  type: string;
  handler: LessonHandler;
}

export type LessonHandler = (
  lesson: Lesson,
  scope: ExecutionScope,
) => Promise<HandlerResult>;

export type HandlerStatus = 'applied' | 'staged' | 'rejected' | 'logged';

export interface HandlerResult {
  status: HandlerStatus;
  message?: string;
}

export interface VisibilityRules {
  expose?: {
    cabinet?: { from: string; as: string }[];
    blackboard?: { from: string; as: string }[];
  };
  accept?: {
    blackboard?: { from: string; as: string }[];
  };
}

export interface PipelineStep {
  agent?: string;
  config?: Record<string, unknown>;
  onError?: 'halt' | 'continue' | 'skip';
}

export interface AgentResult {
  status: 'success' | 'failed' | 'aborted';
  output?: string;
  error?: string;
}

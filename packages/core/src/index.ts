/**
 * Composable Agents — Public API
 *
 * A deterministic runtime for composable AI agents.
 *
 * Usage:
 *   import { Controller, createIdAgent, ConditionEngine } from 'composable-agents';
 *   const result = await controller.run("Write a haiku", { ... });
 */

// Types — the "never changes" layer
export type * from './types/index.ts';

// Runtime — axioms and orchestration
export { Controller } from './runtime/controller';
export type { ControllerConfig, RunOptions, RunResult } from './runtime/controller';
export { SequenceEngine } from './runtime/sequence-engine';
export type { AgentResolver } from './runtime/sequence-engine';
export { ConditionEngine } from './runtime/condition-engine';
export { SignalBusImpl, ReflexEngine, LessonRouter } from './runtime/signal-bus';
export type { ReflexAction, RoutingResult } from './runtime/signal-bus';

// Context
export { Scope } from './context/scope';
export { CabinetImpl } from './context/cabinet';
export { BlackboardImpl } from './context/blackboard';

// Built-in agents
export { createIdAgent, idAgentManifest } from './agents/id/index';
export { createJobAgent, jobAgentManifest } from './agents/job/index';
export { reflexesAgent, reflexesAgentManifest } from './agents/reflexes/index';
export { learningAgent, learningAgentManifest } from './agents/learning/index';
export { memoryAgent, memoryAgentManifest } from './agents/memory/index';

// Foreman Agent
export { createForemanAgent, foremanAgentManifest } from './agents/foreman/index';

// Factory Registry
export { createFactoryRegistry } from './runtime/factory-registry';

// Lesson handlers
export {
  applyImmediately,
  appendToSuggestionsFile,
  stageForReview,
  log,
} from './lessons/handlers';

// Loader
export { loadAgentYaml, validateAgentManifest, AgentRegistry } from './loader/agent-loader';
export { loadPipelineYaml, validatePipeline } from './loader/pipeline-loader';
export type { LoadResult, LoadError } from './loader/agent-loader';
export type { PipelineConfig, ValidationResult } from './loader/pipeline-loader';

// Built-in conditions
export { builtinEvaluators } from './conditions/built-in';

// LLM
export { MockProvider } from './llm/mock-provider';
export type { MockResponse } from './llm/mock-provider';
export { PiProvider } from './llm/pi-provider';
export type { PiProviderOptions } from './llm/pi-provider';

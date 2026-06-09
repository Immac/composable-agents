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
export { Controller } from './runtime/controller.ts';
export type { ControllerConfig, RunOptions, RunResult, RuntimeModeOptions } from './runtime/controller.ts';
export { SequenceEngine } from './runtime/sequence-engine.ts';
export type { AgentResolver } from './runtime/sequence-engine.ts';
export { ReactiveEngine } from './runtime/reactive-engine.ts';
export type { ReactiveEngineConfig } from './runtime/reactive-engine.ts';
export { ConditionEngine } from './runtime/condition-engine.ts';
export { SignalBusImpl, ReflexEngine, LessonRouter } from './runtime/signal-bus.ts';
export type { ReflexAction, RoutingResult } from './runtime/signal-bus.ts';

// Context
export { Scope } from './context/scope.ts';
export { CabinetImpl } from './context/cabinet.ts';
export { BlackboardImpl } from './context/blackboard.ts';

// Built-in agents
export { createIdAgent, idAgentManifest } from './agents/id/index.ts';
export { createJobAgent, jobAgentManifest } from './agents/job/index.ts';
export { reflexesAgent, reflexesAgentManifest } from './agents/reflexes/index.ts';
export { learningAgent, learningAgentManifest } from './agents/learning/index.ts';
export { memoryAgent, memoryAgentManifest } from './agents/memory/index.ts';

// Foreman Agent
export { createForemanAgent, foremanAgentManifest } from './agents/foreman/index.ts';

// Factory Registry
export { createFactoryRegistry } from './runtime/factory-registry.ts';

// Lesson handlers
export {
  applyImmediately,
  appendToSuggestionsFile,
  stageForReview,
  log,
} from './lessons/handlers.ts';

// Loader
export { loadAgent, loadAgentYaml, serializeAgent, validateAgentManifest, AgentRegistry } from './loader/agent-loader.ts';
export { loadPipelineYaml, validatePipeline } from './loader/pipeline-loader.ts';
export type { LoadResult, LoadError, AgentSource, OutputFormat } from './loader/agent-loader.ts';
export type { PipelineConfig, ValidationResult } from './loader/pipeline-loader.ts';

// Built-in conditions
export { builtinEvaluators } from './conditions/built-in.ts';

// LLM
export { MockProvider } from './llm/mock-provider.ts';
export type { MockResponse } from './llm/mock-provider.ts';
export { PiProvider } from './llm/pi-provider.ts';
export type { PiProviderOptions } from './llm/pi-provider.ts';

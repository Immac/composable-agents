# Public API

This document covers the package surface exported from `packages/core/src/index.ts`. Import from `composable-agents` unless you are working inside the repository and intentionally targeting source files.

## Typical entry point

Most applications only need `Controller`, `ConditionEngine`, `builtinEvaluators`, a provider, and a map of agents.

```ts
import {
  Controller,
  ConditionEngine,
  builtinEvaluators,
  createIdAgent,
  createJobAgent,
  PiProvider,
} from 'composable-agents';

const provider = new PiProvider();
const conditionEngine = new ConditionEngine();
conditionEngine.registerAll(builtinEvaluators);

const agents = new Map([
  ['id-agent', createIdAgent(provider)],
  ['job-agent', createJobAgent(provider)],
]);

const controller = new Controller();
const result = await controller.run('Write a haiku about rain.', {
  pipeline: [{ agent: 'id-agent' }, { agent: 'job-agent' }],
  agents,
  conditionEngine,
});
```

Use the lower-level exports when you need a custom runtime, direct scope construction in tests, manifest loading, or parameterized agent factories.

## Types

`index.ts` re-exports `type *` from `packages/core/src/types/index.ts`. This is the stable type layer for authoring agents, providers, factories, and pipeline configs.

Use these types when you want compile-time contracts for the framework surface:

- `Agent`, `AgentManifest`, `AgentResult`, `ExecutionScope` for agent implementations.
- `SequenceStep`, `ParallelGroup`, `SequenceResult` for pipeline execution.
- `Condition`, `ConditionEvaluator` for condition registration and evaluation.
- `Signal`, `ReflexRule`, `Lesson` for signal, reflex, and learning flows.
- `ReactiveConfig`, `ReactiveRunResult` for reactive manifests and results.
- `LLMProvider`, `LLMResponse`, `LLMChunk` for provider implementations.
- `AgentFactory`, `FactoryRegistry`, `FactoryInstanceDeclaration` for parameterized agent creation.

## Runtime exports

### `Controller`

Purpose: the main orchestration entry point.

Use `Controller` when you want the framework to create the root scope, run either sequence or reactive execution, record history, and evaluate controller-managed reflex timings.

```ts
const result = await new Controller().run('Summarize this file', {
  pipeline: [{ agent: 'job-agent' }],
  agents,
  conditionEngine,
  runtime: { mode: 'sequence' },
});
```

### `ControllerConfig`, `RunOptions`, `RunResult`, `RuntimeModeOptions`

Use these exported types when you want strong typing around `Controller.run()`.

- `ControllerConfig` sets the initial identity profile for the run.
- `RunOptions` defines the pipeline, agent map, condition engine, reflexes, lesson handlers, cycle count, and runtime mode.
- `RunResult` is the final controller response with `output`, `status`, `history`, `lessons`, and optional `error`.
- `RuntimeModeOptions` selects `sequence` or `reactive` mode and sets `maxIterations` for reactive convergence.

### `SequenceEngine`

Purpose: execute an explicit ordered pipeline.

Use `SequenceEngine` directly when you want sequence semantics without the rest of the controller loop, or when you are building tests and custom runners.

It supports singular agent steps, nested `sequence` groups, and `parallel` groups. Successful steps merge their child scope back into the parent. Failed steps may still merge when `onError` is `continue`; `skip` discards the child scope; `halt` stops the pipeline.

### `AgentResolver`

Use this type when wiring `SequenceEngine` or `ReactiveEngine`. It is the function signature for `resolveAgent(id) => Agent | undefined`.

### `ReactiveEngine`

Purpose: run agents whose manifest declares `reactive.when` until triggers stop producing new rising edges.

Use `ReactiveEngine` directly when you want condition-driven execution without a predeclared pipeline, or when you want to test reactive convergence in isolation.

```ts
const result = await new Controller().run('bug report', {
  agents,
  conditionEngine,
  runtime: { mode: 'reactive', maxIterations: 20 },
});
```

Current behavior is important:

- Only agents with `manifest.reactive` are considered.
- A trigger fires on a false → true transition, not while it stays true.
- Higher `priority` runs first; map insertion order breaks ties.
- The engine stops when no new trigger edges appear or `maxIterations` is reached.

### `ReactiveEngineConfig`

Use this type when constructing `ReactiveEngine` directly. It requires `resolveAgent` and `conditionEngine`, with optional `maxIterations`.

### `ConditionEngine`

Purpose: register evaluators, parse simple condition expressions, and evaluate condition trees against a scope.

Use `ConditionEngine` whenever your runtime or tooling needs to evaluate declarative conditions.

Current parser behavior is intentionally small:

- Supports leaf conditions like `has-output` or `cabinet-exists(path=bug/classification)`.
- Supports `AND`, `OR`, and `NOT` composition.
- Returns `always-false` for invalid expressions.
- Returns `false` for unknown evaluator types.

### `SignalBusImpl`

Purpose: emit, subscribe to, and inspect typed signals.

Use `SignalBusImpl` when you want explicit event subscription or history outside the controller. The current `Controller` does not route execution through `SignalBusImpl`; it uses `ReflexEngine` and `LessonRouter` directly.

### `ReflexEngine`

Purpose: store reflex rules and evaluate them at a chosen timing point.

Use `ReflexEngine` when building a custom controller or testing reflex behavior. The current `Controller` evaluates reflexes at `pre-cycle`, `post-agent`, and `post-cycle`; `pre-agent` exists in the type system but is not currently executed by `Controller`.

### `LessonRouter`

Purpose: route `Lesson` objects to handlers by target agent id.

Use `LessonRouter` when your runtime needs to deliver lessons to registered learning channels or custom handlers.

### `ReflexAction`, `RoutingResult`

Use these exported types when typing code that inspects reflex outputs or batch lesson routing results.

## Context exports

### `Scope`

Purpose: concrete `ExecutionScope` implementation used by the runtime.

Use `Scope` when you need to manually construct a scope in tests, examples, or custom runners. `Scope.clone()` creates isolated child scopes, `snapshot()` serializes task and cabinet state, and `rollback()` restores a previous snapshot.

### `CabinetImpl`

Purpose: concrete namespaced artifact store.

Use `CabinetImpl` when you need standalone cabinet behavior, such as unit tests or manual agent execution. It supports `put`, `get`, `exists`, glob-style `query`, `remove`, `clear`, `clone`, and `merge`.

The cabinet is the practical handoff protocol between agents. Built-in conditions and the reactive runtime commonly watch cabinet keys such as `bug/classification` or `learning/lessons`.

### `BlackboardImpl`

Purpose: concrete typed working-state store.

Use `BlackboardImpl` when you need a root task state without going through `Controller`. It manages identity, task status, task output, task error, warnings, and cloning.

## Built-in agents

### `createIdAgent`, `idAgentManifest`

Purpose: semantic identity and constraint gate.

Use `createIdAgent(provider)` as the first step in a pipeline when you want a task screened against identity constraints before execution. The implementation uses a keyword pre-filter first and falls back to the provider for semantic checking.

### `createJobAgent`, `jobAgentManifest`

Purpose: the default task-execution agent.

Use `createJobAgent(provider)` when you want a general LLM-backed worker that consumes the task input and writes its output onto the blackboard.

### `reflexesAgent`, `reflexesAgentManifest`

Purpose: in-band marker agent for reflex-related processing.

Use this only if you want a pipeline step that reports on warnings or keeps reflex handling visible in the pipeline. The actual reflex evaluation happens in `ReflexEngine` at the controller level, not inside this agent.

### `learningAgent`, `learningAgentManifest`

Purpose: rule-based lesson producer.

Use this when you want to scan accumulated warnings for repeated patterns and emit structured lessons into cabinet keys such as `learning/lessons`.

### `memoryAgent`, `memoryAgentManifest`

Purpose: stub persistent-memory agent.

Use this only as a placeholder today. The current implementation returns a success message and does not persist anything.

## Foreman export

### `createForemanAgent`, `foremanAgentManifest`

Purpose: multi-cycle pipeline orchestration with approval gates.

Use `createForemanAgent({ resolveAgent, factoryRegistry })` when you want an agent that runs a generation pipeline, then critics, then revision agents until approval, plateau, or max cycles.

The current implementation reads config from the cabinet key `foreman/config`, writes status keys such as `foreman/status`, and returns a JSON string in `AgentResult.output` describing the cycle, scores, and products.

Important current limitation: `foremanAgentManifest` uses `type: 'foreman'`, but `validateAgentManifest()` currently only accepts `llm`, `code`, and `composite`.

## Factory export

### `createFactoryRegistry`

Purpose: create a named registry of parameterized agent factories.

Use this when you want YAML or programmatic declarations to instantiate multiple agent instances from the same factory function.

```ts
const registry = createFactoryRegistry();
registry.register('writer', createWriterAgent, { provider });
const agent = await registry.instantiate({ factory: 'writer', as: 'writer-1', config: { style: 'brief' } });
```

The current `instantiate()` method injects the configured deps, adds `id: as` to the config when present, and attaches `triggers` onto the returned manifest if the declaration includes them.

## Lesson handler exports

### `applyImmediately`

Use this when the target agent should accept a lesson without review. The current implementation only recognizes payloads with `kind: 'new-reflex'`; other payloads are logged.

### `appendToSuggestionsFile`

Use this when you want lessons appended to `.persona/suggestions.md` for human review.

### `stageForReview`

Use this when a lesson should be staged instead of applied. The current implementation returns a staged result and does not persist a review queue.

### `log`

Use this when you want a no-op handler that records the lesson outcome as logged.

## Loader exports

### `loadAgent`

Purpose: normalize agent definitions from YAML, JSON, or inline objects into an `AgentManifest`.

Use `loadAgent()` when your tooling accepts author-facing manifests in multiple formats.

```ts
const { manifest, filePath } = loadAgent('agents/my-agent/agent.yaml');
const inline = loadAgent({
  id: 'test-agent',
  type: 'code',
  version: '0.1.0',
  purpose: 'Test',
  code: { entrypoint: './index.ts' },
  learning: { channels: [] },
});
```

Current detection rules:

- `.yaml` and `.yml` file paths load and parse YAML.
- `.json` file paths load and parse JSON.
- `.ts` and `.js` file paths throw an error and must be imported instead.
- Strings starting with `{` are treated as inline JSON.
- Strings starting with `id:` or `name:` are treated as inline YAML.

### `loadAgentYaml`

Use this as a backward-compatible alias of `loadAgent()`.

### `serializeAgent`

Purpose: emit an `AgentManifest` as YAML or JSON.

Use this when you want tooling to write normalized manifests back to disk or display a converted format.

### `validateAgentManifest`

Purpose: perform lightweight manifest validation.

Use this when you want fast checks for required fields before registration or serialization. The current validator checks `id`, `type`, `purpose`, type-specific config blocks, and `learning.channels`; it does not enforce the full schema from `schemas/`.

### `AgentRegistry`

Purpose: store and resolve agent instances by id.

Use `AgentRegistry` when you want a programmatic `register/get` lookup object for validation, composition, or CLI tooling.

```ts
const registry = new AgentRegistry();
registry.register(createIdAgent(provider));
registry.register(createJobAgent(provider));
const agent = registry.get('job-agent');
```

`Controller` itself accepts a plain `Map<string, Agent>`, so `AgentRegistry` is optional rather than required.

### `LoadResult`, `LoadError`, `AgentSource`, `OutputFormat`

Use these types when building tooling around the loader. `LoadResult` is what `loadAgent()` returns, `AgentSource` is the accepted source type, and `OutputFormat` is `'yaml' | 'json'`.

`LoadError` is exported as a shape for structured loader errors, but the current `loadAgent()` implementation throws `Error` instances instead of returning `LoadError` objects.

### `loadPipelineYaml`

Purpose: parse a pipeline YAML file into a `PipelineConfig` object.

Use this when your runtime or CLI reads declarative pipelines from disk.

### `validatePipeline`

Purpose: check pipeline structure against a registered agent set.

Use this before execution to catch missing agent ids and invalid reflex targets.

Current validation is intentionally narrow: it checks explicit `agent` references and reflex targets against `AgentRegistry`, but it does not fully validate factory declarations or condition expressions.

### `PipelineConfig`, `ValidationResult`

Use these exported types when building pipeline tooling or custom validators.

## Condition library export

### `builtinEvaluators`

Purpose: register the standard condition library.

Use `conditionEngine.registerAll(builtinEvaluators)` during startup unless you want a completely custom condition set.

The shipped evaluators currently include:

- task state checks such as `has-output`, `has-error`, `complete`, and `failed`
- warning checks such as `has-warnings` and `warnings-count`
- repeated-warning detection via `repeated-error`
- task text matching via `task-contains`
- cabinet path checks via `cabinet-exists`
- testing helpers `always-true` and `always-false`

## LLM provider exports

### `MockProvider`, `MockResponse`

Purpose: deterministic test provider.

Use `MockProvider` in unit tests, examples, or offline runs where you want canned responses, optional delays, call counting, and simple streaming.

### `PiProvider`, `PiProviderOptions`

Purpose: pi SDK-backed `LLMProvider`.

Use `PiProvider` when you want to run the framework against models available through the pi SDK.

```ts
const provider = new PiProvider({
  modelId: 'github-copilot/gpt-5-mini',
  sessionDir: '.composable-agents/sessions',
});
```

Current behavior matters:

- It resolves the pi SDK from the global npm install first, then falls back to the project dependency.
- Each provider instance reuses one pi session so history accumulates across calls.
- Session creation currently sets `noTools: 'all'`, so the exported API does not yet expose a tool-enabled research agent or web-search wiring.

## Public surface not currently exported

The current `index.ts` does **not** export a Research Agent, Doc Builder agent, or Framework Builder agent. The repository snapshot also does not contain source files for those agents under `packages/core/src/`, so they are not part of the documented public API yet.

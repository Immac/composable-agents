# Architecture

> **Stability:** These interfaces form the "never changes" list. After v1.0, breaking changes require a major version bump.

## Overview

Composable Agents is a **deterministic runtime for non-deterministic agents**. The public surface is small: agents implement one interface, conditions stay pure, and the controller chooses a runtime mode over a shared scope model.

```
┌──────────────────────────────────────────────────────┐
│ SHIPPED PATTERNS                                     │
│ pipeline · reactive runtime · reflexes · learning    │
│ foreman approval loops · user-defined compositions   │
├──────────────────────────────────────────────────────┤
│ AXIOMS                                               │
│ Sequence   ordered and parallel execution            │
│ Signal     events orthogonal to execution            │
│ Condition  synchronous state queries                 │
├──────────────────────────────────────────────────────┤
│ CONTROLLER MODES                                     │
│ sequence   explicit pipeline order                   │
│ reactive   trigger-driven until convergence          │
├──────────────────────────────────────────────────────┤
│ STORAGE                                              │
│ Blackboard typed working state                       │
│ Cabinet    namespaced artifact protocol              │
└──────────────────────────────────────────────────────┘
```

The important architectural idea is that the same agent contract works in both controller modes. A pipeline agent, a reactive agent, and a foreman agent all execute against the same `ExecutionScope` and communicate through the same blackboard and cabinet surfaces.

---

## Axioms

### Sequence

Sequence is ordered execution. `SequenceEngine` accepts singular agent steps, nested `sequence` groups, and `parallel` groups.

```typescript
type SequenceStep =
  | { agent: string }
  | { agent: string; config?: Record<string, unknown>; onError?: 'halt' | 'continue' | 'skip' }
  | { sequence: SequenceStep[] }
  | { parallel: ParallelGroup };
```

Each step runs in declared order. For direct agent steps the engine clones the parent scope, executes the agent in isolation, and then decides whether to merge the child scope back based on the result and `onError` policy.

Parallel branches also get isolated child scopes. The current implementation merges cabinet state back at the join point and preserves branch declaration order in the returned results.

### Signal

Signal is the orthogonal event channel. Signals are typed payloads that can be emitted, subscribed to, and inspected without changing the sequence topology.

```typescript
interface Signal {
  type: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
}
```

The current codebase exposes `SignalBusImpl`, `ReflexEngine`, and `LessonRouter`. `SignalBusImpl` is the general event bus, while `ReflexEngine` and `LessonRouter` are the concrete controller-facing pieces used today for reflex evaluation and lesson delivery.

### Condition

Condition is a synchronous, side-effect-free query over scope state. `ConditionEngine` evaluates conditions against the blackboard and cabinet, and supports composition through `and`, `or`, and `not`.

```typescript
type Condition =
  | { type: string; params?: Record<string, unknown> }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };
```

Conditions are the glue between declarative config and runtime behavior. Reflex rules, built-in checks, and reactive triggers all depend on the same evaluator registry.

---

## How the axioms compose

The framework deliberately derives higher-level behavior from the same three primitives.

| Pattern | Composition |
|---------|-------------|
| Pipeline | Sequence |
| Reactive runtime | Condition decides readiness, Sequence-style agent execution applies work |
| Reflexes | Condition decides whether to fire, Signal names the action, Sequence provides the timing point |
| Learning loop | Sequence provides cycles, Signal carries lessons, Condition detects patterns |
| Foreman approval loop | Sequence runs generation and revision work, Condition-like score thresholds gate approval, Cabinet stores the protocol artifacts |

This is why new behavior usually appears as new data or new evaluators rather than a new execution model. The controller and engines stay small because the composition points stay fixed.

---

## Controller modes

### Sequence mode

`sequence` is the default controller mode. You provide `RunOptions.pipeline`, the controller builds a root `Scope`, and `SequenceEngine` executes the declared steps in order.

Use sequence mode when the workflow order is known ahead of time. It is the right fit for pipelines like `id-agent -> job-agent -> learning-agent`, for nested sequences, and for explicit parallel fan-out.

### Reactive mode

`reactive` is the condition-driven controller mode. Instead of a pipeline, the controller scans the provided agent map for manifests with a `reactive` block.

```typescript
reactive?: {
  when: string;
  priority?: number;
}
```

`ReactiveEngine` evaluates every reactive trigger against the current scope, collects agents whose trigger became true on that pass, sorts them by descending `priority`, executes them, merges their child scopes, and repeats.

The convergence rule is **rising-edge semantics**. An agent runs when its trigger transitions from false to true. If the condition stays true, the agent does not run again until the condition goes false and later becomes true again.

This gives a deterministic notion of convergence for cabinet-driven workflows. The engine stops when no new trigger edges appear, when the abort signal fires, or when `maxIterations` is reached.

---

## Storage model

### Blackboard

Blackboard is the typed working state for a scope. It answers the question, "What is happening now?"

| Field | Type | Purpose |
|-------|------|---------|
| `identity` | `{ name, constraints, values, forbiddenTopics? }` | The run identity and constraints |
| `task` | `{ input, goal, status, output?, error? }` | The current task state |
| `warnings` | `string[]` | Cross-cutting warnings accumulated during execution |

`BlackboardImpl` adds mutation helpers like `setTaskOutput()`, `setTaskError()`, and `addWarning()`. Conditions can query blackboard state synchronously.

### Cabinet

Cabinet is the namespaced artifact store for a scope. It answers the question, "What has been stored for others to inspect?"

```typescript
context.cabinet.put('drafts/v2.md', content)
context.cabinet.get('drafts/v2.md')
context.cabinet.exists('images/output.png')
context.cabinet.query('drafts/*')
```

`CabinetImpl` supports exact reads, glob-style queries, cloning, and merge strategies. Agents use it for artifacts such as drafts, scores, lessons, checkpoints, and intermediate analysis.

### Cabinet as the protocol

In practice, the cabinet is the protocol surface between agents. Agents do not call each other directly; they publish artifacts under stable keys and let later steps or triggers read them.

Examples from the current tree include `learning/lessons`, `bug/classification`, `bug/fix`, and `foreman/status`. Reactive triggers commonly depend on `cabinet-exists(path=...)`, which makes cabinet keys the handshake between upstream work and downstream activation.

The cabinet-centric design is what lets sequence and reactive execution share the same contract. A sequential agent can write `bug/classification`, and a reactive agent can wake up on that key without any extra integration layer.

### Scoping rules

Every controller run starts with a root scope. Each agent execution receives a cloned child scope containing a cloned blackboard and cabinet.

```text
root scope
  ├─ sequence step child scope
  ├─ parallel/0 child scope
  ├─ parallel/1 child scope
  └─ reactive agent child scope
```

Child scopes isolate in-flight mutations. The runtime merges selected child state back into the parent only after execution completes.

Composite visibility is still explicit in manifests through `visibility.expose`, but the low-level runtime primitives are clone and merge. Parent scopes do not observe a live stream of child mutations.

---

## Agent lifecycle

### 1. Resolution

The runtime resolves an agent by id from a `Map<string, Agent>` or another resolver function. `AgentRegistry` is one optional programmatic wrapper for this lookup pattern, but the controller itself consumes a plain map.

### 2. Scope creation

The runtime clones the current scope before every agent execution. This gives the agent an isolated blackboard and cabinet view and enables rollback-by-discard when a result should not propagate.

### 3. Execution

The agent runs `execute(scope, signal)` and returns an `AgentResult` with `success`, `failed`, or `aborted`. Built-in agents commonly follow the sandwich pattern of deterministic checks, a non-deterministic or procedural core, and deterministic post-processing.

### 4. Merge or discard

Sequence mode merges successful child scopes back into the parent. Failures also merge when the step uses `onError: 'continue'`; `onError: 'skip'` discards the child scope; `onError: 'halt'` stops further sequence execution.

Reactive mode merges child scope after every completed reactive agent run and then re-evaluates all triggers against the updated parent scope. This is what allows downstream cabinet triggers to unlock on later passes.

### 5. Record and react

The controller records each agent result into run history. It also updates task error state on the blackboard and evaluates controller-managed reflex timings around the run.

The current controller evaluates reflex rules at `pre-cycle`, `post-agent`, and `post-cycle`. The type system includes `pre-agent`, `mid-stream`, and `pre-tool-call`, but those timings are not currently executed by `Controller`.

### 6. Repeat or finish

Sequence mode advances to the next step or cycle. Reactive mode repeats trigger evaluation until no new rising edges appear. The final `RunResult` is then assembled from the root scope's blackboard plus the recorded history.

---

## The "never changes" list

| Interface | Reason |
|-----------|--------|
| `Agent` | Everything composes through this |
| `AgentManifest` | Agents declare themselves through this |
| `ExecutionScope` | All agents coordinate through blackboard + cabinet through this surface |
| `Condition` | All conditions compose through this |
| `Signal` | All cross-agent event traffic uses this shape |
| `LLMProvider` | Backend abstraction |
| `Controller.run()` | Public API entry point |

---

## Agent sandwich pattern

This is the common structure used by built-in agents even though the runtime does not enforce it.

```
┌─ PRE-CHECKS (deterministic) ──────────────────────┐
│ keyword filters · contract validation             │
│ controller/runtime checks happen around here      │
└──────────────────┬────────────────────────────────┘
                   ▼
┌─ CORE (configurable type) ────────────────────────┐
│ llm:      provider call                           │
│ code:     deterministic procedure                 │
│ composite: delegated sub-pipeline                 │
│ foreman:  iterative pipeline + approval loop      │
└──────────────────┬────────────────────────────────┘
                   ▼
┌─ POST-PROCESSING (deterministic) ─────────────────┐
│ stamp output onto blackboard                      │
│ write cabinet artifacts                           │
│ add warnings / lessons / scores                   │
└───────────────────────────────────────────────────┘
```

This pattern keeps the orchestration deterministic while still letting the core of an agent be non-deterministic or model-backed.

---

## Current implementation notes

- `PiProvider` is the shipped pi SDK integration, but it creates sessions with `noTools: 'all'`. The current core therefore does not expose a tool-enabled research agent or web-search workflow.
- The public type layer includes `type: 'foreman'`, and `createForemanAgent()` ships in the package, but `validateAgentManifest()` currently only accepts `llm`, `code`, and `composite` manifests.
- Parallel branch merge configuration includes a `blackboard` field in the type definitions, but `SequenceEngine` currently merges cabinet state only at the join point.

## Philosophy

> *Anything that can be systematically enforced, will be. LLMs fill only the gaps that cannot be codified.*

- **Deterministic orchestration** — pipeline order, trigger evaluation, reflex timing, and lesson routing are code, not model choices.
- **LLMs are specialized tools** — they write text, analyze semantics, and recognize patterns. They do not choose the runtime topology.
- **Context is scoped** — each agent gets a cloned execution view and only merged state becomes shared truth.
- **Everything is data** — manifests, pipeline configs, condition expressions, lessons, scores, and cabinet artifacts are all declarative surfaces.

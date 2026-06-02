# Composable Agents — Specification

> **Status:** v0.1 — Pre-implementation  
> **License:** MIT  
> **Language:** TypeScript (library, npm package)

---

## 1. Identity

**Composable Agents** is a TypeScript library for building reliable agentic systems from specialized sub-agents. It provides a deterministic runtime where LLMs fill only the gaps that cannot be codified.

**Not a framework, not a platform — a library.** Users import it, compose agents, and call `run()`.

**Relationship to existing code:**
- **`personality-driven-agent`** — prototype that proves the concept. This spec supersedes it.
- **`personality-core`** — external dependency for deterministic personality/state/outcome logic. Not part of this library.

---

## 2. Core Philosophy

> *Anything that can be systematically enforced, will be. LLMs fill only the gaps that cannot be codified.*

Consequences of this principle:
- **Deterministic orchestration** — pipeline order, reflex conditions, lesson routing are code, not LLM decisions
- **LLMs are specialized tools** — they write text, analyze semantics, recognize patterns. They do not decide the control flow
- **Context is scoped** — each agent sees only its slice. No context rot
- **Everything is data** — agent declarations, pipeline configs, condition expressions, lesson payloads

---

## 3. Axioms

The framework is built on exactly three axioms. Everything else is derived.

### 3.1 Sequence

Ordered execution of agents. Steps can be:
- **Singular** — a single agent
- **Sequential group** — sub-steps run in order
- **Parallel group** — sub-steps run concurrently with isolated cabinets

```typescript
type PipelineStep =
  | { agent: string }
  | { sequence: PipelineStep[] }
  | { parallel: PipelineStep[]; join: JoinMode; merge: MergeStrategy };
```

**Properties:**
- Steps within a sequence run in declared order
- A parallel group waits for all branches before proceeding (configurable per join mode)
- Each parallel branch gets an isolated cabinet — no cross-writes
- Signals from parallel branches are ordered by branch declaration order
- Conditions evaluate against pre-join scope state (pre-join condition scope)
- Each scope supports snapshot/rollback

### 3.2 Signal

Events that flow orthogonally to the execution sequence. Signals carry typed payloads and can be:
- **Emitted** — any agent or the runtime can emit a signal
- **Subscribed** — agents, reflexes, and the controller can subscribe to signal types
- **Routed** — the controller routes lessons by type to target agent channels

```typescript
interface Signal {
  type: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
}
```

Signal types include:
- **Reflex actions** — condition → action dispatch
- **Lessons** — structured teaching data between agents
- **Warnings** — cross-cutting alert data
- **Telemetry** — agent lifecycle events

**Properties:**
- Signals are NOT the primary data flow — blackboard/cabinet is
- The signal bus interface is carved from day one; MVP uses it for reflexes + lessons
- Signal history is accumulated in the cabinet under a reserved namespace

### 3.3 Condition

Synchronous predicates that query a scope's blackboard + cabinet. Composable via `and` / `or` / `not`.

```typescript
type Condition =
  | { type: string; params?: Record<string, unknown> }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };
```

**Properties:**
- Conditions are evaluated by named evaluators registered with the condition engine
- Built-in evaluators ship with the library (see section 7)
- Users register custom evaluators at agent load time
- Conditions never have side effects — they are pure queries
- Conditions can be expressed as structured data or as string expressions (parsed into the same tree)

---

## 4. Shipped Patterns (Derived from Axioms)

These are the four patterns that ship as the default toolkit. They are **not axioms** — they are the most useful compositions of Sequence + Signal + Condition. Users can build other patterns.

### 4.1 Pipeline

A flat or nested sequence of agents. The simplest pattern.

```yaml
pipeline:
  - id-agent
  - job-agent
  - reflexes-agent
  - learning-agent
```

Axioms: Sequence.

### 4.2 Composite

An agent that IS a pipeline. Implements the same `Agent` interface as primitives. Can be nested arbitrarily.

```typescript
class CompositeAgent implements Agent {
  async execute(scope, signal) {
    return this.sequenceEngine.run(this.pipeline, scope, signal);
  }
}
```

**Visibility:** Parent sees child data only through explicit `visibility.expose` declarations. Default: black box.

Axioms: Sequence (nesting).

### 4.3 Reflexive

Condition-action rules that fire at configurable timing points.

**Timing modes:**
- `pre-agent` — before a specific agent runs. Can block the agent.
- `post-agent` — after an agent completes. Can discard output or trigger rollback.
- `mid-stream` — during LLM streaming. Can abort mid-generation.
- `pre-cycle` — before the pipeline starts.
- `post-cycle` — after the pipeline completes.
- `pre-tool-call` — before an LLM tool call executes. Can block the call.

```yaml
reflexes:
  - timing: pre-agent
    condition: "has-error"
    action: skip-agent
  - timing: pre-tool-call
    condition: "tool-call-name:bloom_flowers"
    action: block
```

Axioms: Condition (when) + Signal (action) + Sequence (timing context).

### 4.4 Learning Loop

Pipeline runs in cycles. The Learning Agent observes history across cycles, produces structured lessons, and the Controller routes them to target agents' learning channels.

```yaml
learning:
  maxCycles: 3
  observe: [history, warnings, reflex-firings]
  detectors:
    - repeated-error
    - frequent-reflex
    - empty-output
```

Axioms: Sequence (cycles) + Signal (lessons) + Condition (detection triggers).

---

## 5. Storage Model

### 5.1 Blackboard

Typed working state. What is happening **now**.

```typescript
interface SharedContext {
  identity: IdentityProfile;
  task: TaskState;
  warnings: string[];
  // Scope management
  snapshot(): string;
  rollback(key: string): void;
}
```

- Typed fields with mutation methods
- Read/write by agents within the same scope
- Snapshot/rollback per scope
- Conditions query it synchronously

### 5.2 Cabinet

Namespaced artifact storage. What agents have **stored**.

```typescript
interface Cabinet {
  put(path: string, value: unknown): void;
  get<T>(path: string): T | undefined;
  exists(path: string): boolean;
  query(pattern: string): CabinetEntry[];
  remove(path: string): void;
}
```

- Arbitrary namespaced keys (e.g. `drafts/v2.md`, `images/panel-3.png`, `signals/reflex-history`)
- Scoped per composite level
- Isolated per parallel branch — merged at join via declared strategy
- **Not visible** to parent scope unless `visibility.expose` declares it
- Conditions query it synchronously

### 5.3 Scoping Rules

```
Framework scope           agents see framework blackboard + cabinet
  └─ Composite A scope    agents see A's blackboard + cabinet
       └─ Composite B     agents see B's blackboard + cabinet
```

- Each composite level gets its own blackboard + cabinet
- Primitive agents share their parent scope's blackboard + cabinet
- A scope inherits parent data at creation time but does NOT see ongoing parent changes
- Visibility is explicit: `visibility.expose` declares what surfaces to the parent
- Without explicit visibility, a composite is a black box

### 5.4 Parallel Execution Cabinets

Each branch in a parallel group gets an isolated temporary cabinet. On join:
- The merge strategy determines how branches combine into the parent's cabinet
- Default: each branch's cabinet is namespaced by branch index

```yaml
- group:
    type: parallel
    run: [agent-a, agent-b]
    merge:
      cabinet: namespaced    # parallel/0/*, parallel/1/*
      blackboard:
        task.output: concat
```

---

## 6. Agent Declaration Format

Agents declare themselves in YAML files alongside their code:

```yaml
# agent.yaml
id: my-agent
type: llm                    # llm | code | composite
version: 0.1.0
purpose: "One-line description"

deterministic:
  pre_checks:                # Run before core
    - condition: "has-error"
      action: skip
  post_processing:           # Run after core
    - condition: "output.empty"
      action: retry

llm:                         # Only for type: llm
  prompt_template: ./prompt.md
  model: opencode-go/deepseek4flash
  temperature: 0.1

code:                        # Only for type: code
  entrypoint: ./index.ts
  timeout: 30000

pipeline:                    # Only for type: composite
  - sub-agent-1
  - sub-agent-2

communication:
  consumes:
    - event: task
  produces:
    - event: task.output
    - event: warning

learning:
  channels:
    - type: modify-prompt
      handler: apply-immediately

visibility:                  # Only for composite agents
  expose:
    cabinet:
      - from: output/*
        as: results/
    blackboard:
      - from: phase
        as: pipeline.phase
```

Fields are validated against a JSON Schema at load time. Unknown fields are rejected.

---

## 7. Built-in Condition Evaluators

| Evaluator | Params | Queries |
|:---|---:|:---:|
| `has-output` | — | `blackboard.task.output !== undefined` |
| `has-error` | — | `blackboard.task.error !== undefined` |
| `complete` | — | `blackboard.task.status === 'complete'` |
| `failed` | — | `blackboard.task.status === 'failed'` |
| `has-warnings` | — | `blackboard.warnings.length > 0` |
| `repeated-error` | `threshold` (default 3) | `cabinet.query("history[result^='error:']").duplicates >= threshold` |
| `cabinet-exists` | `path` (glob) | `cabinet.exists(path)` |
| `warnings-count` | `threshold` | `blackboard.warnings.length >= threshold` |
| `task-contains` | `text` | `blackboard.task.input.includes(text)` |
| `signal-received` | `type` | Signal of that type has been emitted in scope |

Conditions compose:
```yaml
condition:
  and:
    - has-output
    - not: has-error
```

String expression equivalent (parsed into the same tree):
```
"has-output AND NOT has-error"
```

---

## 8. Error Policies

Per-step error handling:

| Policy | Behavior |
|:---|---:|
| `continue` | Keep context changes, record error, proceed to next step |
| `skip` | Rollback context changes, record error, proceed to next step |
| `halt` | Stop the pipeline immediately, propagate error |

Default per agent type can be set in agent.yaml.

---

## 9. IN Scope (v1.0)

- [x] Three axioms (Sequence, Signal, Condition) as the runtime
- [x] Pipeline, Composite, Reflexive, Learning Loop as shipped patterns
- [x] Blackboard (typed working state) + Cabinet (namespaced artifact storage)
- [x] Per-composite scoping with explicit visibility rules
- [x] Parallel execution with isolated cabinets and configurable merge
- [x] Data-driven agent declarations (agent.yaml)
- [x] Condition evaluator registry with AND/OR/NOT composition
- [x] String expression parser for conditions (syntactic sugar)
- [x] Reflex system with 6 timing modes and block/discard/abort actions
- [x] Lesson system with type-based routing to agent learning channels
- [x] Built-in agents: Id, Job, Reflexes, Learning, Memory
- [x] Built-in condition evaluators (section 7)
- [x] LLMProvider interface (swap any backend)
- [x] MockProvider for testing
- [x] Standalone CLI
- [x] Snapshot/rollback per scope
- [x] Full test coverage of axioms and shipped patterns
- [x] JSON Schema for agent.yaml and pipeline.yaml
- [x] Validation CLI (validate, validate-pipeline) with structured JSON output
- [x] Introspection CLI (inspect, graph, explain, trace)
- [x] Scaffold CLI (generate agent skeletons)
- [x] Skills for pi (composable-agents-create, composable-agents-pipeline, composable-agents-debug)
- [x] Project AGENTS.md template
- [x] Structured error output with fix suggestions

---

## 10. OUT of Scope (v1.0)

These are explicitly NOT part of the MVP. They go in WISHLIST.md.

- [ ] LLM-driven Learning Agent (rule-based only for v1.0)
- [ ] Muscle Memory Agent (procedural compilation)
- [ ] Multi-session persistence (SQLite/JSON)
- [ ] Visual debugger / TUI
- [ ] Agent marketplace / registry
- [ ] Rust bridge for hot paths
- [ ] Recursive self-improvement (Learning Agent teaching itself)
- [ ] Format negotiation between teacher/student agents
- [ ] Parallel branch migration (moving work between branches mid-execution)
- [ ] Real-time streaming UI
- [ ] Agent-defined custom YAML tags
- [ ] Python / other language agent runtimes
- [ ] Distributed execution across machines
- [ ] Persistent cabinet (file-backed long-term storage)

---

## 11. API Stability Promise

After v1.0, these interfaces will not change without a major version bump:

| Interface | Reason |
|:---|---:|
| `Agent` | Everything composes through this |
| `AgentManifest` | Agents declare themselves through this |
| `SharedContext` (blackboard + cabinet) | All agents coordinate through this |
| `Condition` | All conditions compose through this |
| `Signal` | All cross-agent communication uses this |
| `LLMProvider` | Backend abstraction |
| `Controller.run()` | Public API entry point |

---

## 12. Testing Requirements

Every axiom implementation must have:
- Happy path tests
- Edge case tests (empty pipeline, max depth, abort during execution)
- Error condition tests (handler errors swallowed, missing agents, invalid config)
- Property-based tests where applicable (condition composition is associative, etc.)

No feature is considered complete until its tests pass.

---

## 13. Build & Release

```bash
npm test              # Run all tests
npm run build         # TypeScript compile
npm run lint          # Biome check
npm run format        # Biome format
```

Release process:
1. All tests pass
2. CHANGELOG.md updated
3. Version bump per semver
4. Tagged git commit
5. `npm publish`

---

## 14. LLM-Friendliness

The framework is designed to be used not just by human developers but by AI coding agents (like pi). Every tool, format, and convention should support both audiences.

### 14.1 Guiding Principles

| Principle | Why |
|:---|---:|
| **Structured output over prose** | CLI commands produce JSON — LLMs parse JSON reliably. Natural language is for humans. |
| **Validate early, validate often** | A JSON Schema + validation CLI catches mistakes before they reach runtime. LLMs can fix based on structured errors. |
| **Declarative over imperative** | `agent.yaml` is self-describing. An LLM can read a directory of agent files and understand the system without running it. |
| **One convention, not many** | One way to declare an agent, one way to compose conditions, one way to scope visibility. Reduces LLM guesswork. |
| **Teach the pattern, not the implementation** | Skills (SKILL.md) teach *what to build*, not *how the internals work*. The LLM doesn't need to know the runtime. |

### 14.2 What We Ship

| Artifact | Format | Purpose |
|:---|---:|:---:|
| JSON Schema | `schemas/agent-v1.json`, `schemas/pipeline-v1.json` | Validate agent.yaml against the schema. Published as URL + bundled in package. |
| Validation CLI | `npx composable-agents validate` | Parse + validate agent.yaml/pipeline.yaml. Outputs structured JSON errors with fix suggestions. |
| Validation pipeline | `npx composable-agents validate-pipeline` | Cross-reference agent IDs, check condition composition, verify learning channel routing. |
| Introspection CLI | `npx composable-agents inspect` | Show agent graph, input/output contracts, condition evaluators, learning channels, visibility rules. |
| Graph CLI | `npx composable-agents graph` | Emit DOT or JSON dependency graph of a pipeline for visualization. |
| Explain CLI | `npx composable-agents explain` | Natural language summary of a pipeline from its YAML — useful for LLMs to quickly understand unfamiliar configs. |
| Scaffold CLI | `npx composable-agents scaffold` | Generate agent skeletons (`llm-agent`, `code-agent`, `composite-agent`). |
| Trace CLI | `npx composable-agents trace` | Dry-run a pipeline showing which conditions fire, lessons produced, and scope state at each step. |

### 14.3 JSON Schema (agent-v1.json)

Published at a stable URL and bundled in the npm package. LLMs can reference it to constrain output:

```yaml
# agent.yaml
$schema: https://composable-agents.dev/schemas/agent-v1.json
```

The schema enforces:
- Required fields per agent type (llm vs code vs composite)
- Valid condition evaluator names
- Valid action names (skip, halt, block, etc.)
- Valid timing modes
- Valid learning channel handler names
- No unknown fields
- Correct cross-references (composite pipelines reference existing agent IDs)

### 14.4 Validation CLI Output Format

All validation commands emit structured JSON:

```json
{
  "valid": false,
  "file": "agents/my-agent/agent.yaml",
  "errors": [
    {
      "path": "learning.channels[0].handler",
      "severity": "error",
      "message": "Unknown handler 'apply-immediate'. Did you mean 'apply-immediately'?",
      "fix": "Replace value with 'apply-immediately'",
      "schema_ref": "#/definitions/LearningChannel/properties/handler"
    }
  ],
  "warnings": [
    {
      "path": "deterministic.pre_checks[0]",
      "severity": "warning",
      "message": "Condition 'has-error' is always false before any agent runs",
      "fix": "Move to post_checks or use a different condition"
    }
  ]
}
```

Every error includes a `fix` field — actionable text an LLM can apply.

### 14.5 Skills

The framework ships with pi skills that teach LLMs how to work with it. Skills live in `skills/` at the project root and can be installed to `.pi/skills/` for automatic discovery.

| Skill | What it teaches |
|:---|---:|
| `composable-agents-create` | How to write an agent.yaml + implement the agent. Includes template generation guidance. |
| `composable-agents-pipeline` | How to compose agents into pipelines with reflexes, learning loops, and error policies. |
| `composable-agents-debug` | How to inspect agent behavior, trace condition evaluations, verify scope and lesson routing. |

### 14.6 Project Context File (AGENTS.md)

The project ships a template `AGENTS.md` file that pi auto-discovers. It provides:
- Quick command reference
- Project conventions
- Key file locations
- Important rules (scoping, visibility, learning channels)

### 14.7 Scaffold Templates

Built-in templates for agent creation:

```bash
# Create an LLM agent (needs prompt.md)
npx composable-agents scaffold llm-agent agents/translator

# Create a code agent (needs index.ts)
npx composable-agents scaffold code-agent agents/validator

# Create a composite agent (needs pipeline config)
npx composable-agents scaffold composite-agent agents/supervisor

# Create a condition evaluator
npx composable-agents scaffold condition conditions/my-check
```

Each generates a minimal working skeleton with placeholder content and cross-references to the relevant documentation.

### 14.8 CLI Behavior Rules

- `--json` flag on any command produces machine-readable JSON (default for piped output, opt-in for TTY)
- `--pretty` flag on any command produces human-readable color output (default for TTY)
- `--quiet` suppresses all non-error output
- Exit codes: 0 = success, 1 = validation failure, 2 = runtime error

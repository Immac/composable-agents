# 🔧 Composable Agents

A TypeScript library for building reliable agentic systems from specialized sub-agents. Deterministic runtime where LLMs fill only the gaps that cannot be codified.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Tests](https://img.shields.io/badge/tests-146%20passing-brightgreen?style=flat-square)

## ✨ Features

- 🧩 **Three axioms** — Sequence, Signal, Condition. Everything else is derived
- ⚡ **Reactive runtime** — agents trigger on cabinet state until convergence
- 🔄 **Dual modes** — sequential pipelines or reactive execution, same agent contract
- 🏗️ **Deterministic orchestration** — pipeline order, reflexes, lessons are code, not LLM decisions
- 📦 **Cabinet protocol** — namespaced key-value store for inter-agent communication
- 🧠 **Learning system** — skills (permanent) and lessons (decay after quiet runs)
- 🔍 **Condition engine** — pure queries against scope state, no side effects

## 📦 Installation

```bash
npm install composable-agents
```

## 🚀 Quick Start

```typescript
import { Controller, ConditionEngine, builtinEvaluators } from 'composable-agents';

// Create agents
const agents = new Map();
agents.set('greeter', {
  id: 'greeter',
  manifest: { id: 'greeter', type: 'code', version: '0.1.0', purpose: 'Greets user' },
  execute: async (scope) => {
    scope.blackboard.setTaskOutput('Hello, World!');
    return { status: 'success', output: 'Hello, World!' };
  },
});

// Run pipeline
const controller = new Controller();
const result = await controller.run('Say hello', {
  pipeline: [{ agent: 'greeter' }],
  agents,
  conditionEngine: new ConditionEngine(),
});

console.log(result.output); // "Hello, World!"
```

## 🧩 Three Axioms

### Sequence — ordered execution

Agents run in declared order. Steps can be singular, sequential, or parallel.

```typescript
const pipeline = [
  { agent: 'input-agent' },        // singular
  { sequence: [                     // sequential
    { agent: 'validator' },
    { agent: 'transformer' },
  ]},
  { parallel: [                     // parallel branches
    { agent: 'frontend-check' },
    { agent: 'backend-check' },
  ], join: 'all', merge: 'latest' },
];
```

### Signal — orthogonal events

Reflexes and lessons flow alongside execution, not through it.

```typescript
const reflexes = [{
  timing: 'post-cycle',
  condition: 'has-error',
  action: 'abort-agent',
}];
```

### Condition — pure queries

No side effects. Just check state.

```typescript
const conditionEngine = new ConditionEngine();
conditionEngine.registerAll(builtinEvaluators);

// cabinet-exists(path=bug/classification)
// blackboard-equals(key=task.status, value="ready")
```

## ⚡ Reactive Runtime

Agents declare triggers on cabinet state. Runtime evaluates until convergence.

```typescript
// Agent manifest
{
  reactive: {
    when: 'cabinet-exists(path=bug/classification)',
    priority: 10,
  },
}

// Run reactively
const result = await controller.run(task, {
  pipeline: [{ agent: 'classify' }, { agent: 'fix' }],
  agents,
  conditionEngine,
  runtime: { mode: 'reactive', maxIterations: 50 },
});
```

Uses **rising-edge semantics** — agents run only when their trigger transitions from false → true.

## 🏗️ Architecture

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

## 📚 Core Concepts

### Agent

```typescript
interface Agent {
  id: string;
  manifest: AgentManifest;
  execute(scope: ExecutionScope, signal?: AbortSignal): Promise<AgentResult>;
}
```

### AgentManifest

```typescript
{
  id: string;
  type: 'llm' | 'code' | 'composite';
  version: string;
  purpose: string;
  reactive?: { when: string; priority?: number };
  learning?: { channels: string[] };
  visibility?: { expose: { cabinet: string[] } };
}
```

### Cabinet

Namespaced key-value store for inter-agent communication.

```typescript
scope.cabinet.put('bug/classification', 'frontend');
const classification = scope.cabinet.get('bug/classification');
```

### Blackboard

Typed working state per agent.

```typescript
scope.blackboard.task.input;    // what the agent received
scope.blackboard.setTaskOutput('result');
```

## 🛠️ Built-in Agents

| Agent | Purpose |
|-------|---------|
| `id` | Identity agent — declares constraints and values |
| `job` | Job tracking agent |
| `reflexes` | Reflex evaluation agent |
| `learning` | Learning loop agent |
| `memory` | Memory persistence agent |
| `foreman` | Approval gate agent |

## 📖 Documentation

- [Specification](SPEC.md) — full design contract
- [Architecture](docs/ARCHITECTURE.md) — runtime model and axioms
- [API Reference](docs/API.md) — public exports
- [Condition Language](docs/CONDITION_LANGUAGE.md) — condition expressions
- [Pipeline Format](docs/PIPELINES.md) — pipeline YAML syntax
- [Agent Format](docs/AGENT_FORMAT.md) — agent YAML syntax

## 🧪 Testing

```bash
cd packages/core
npm test        # 146 tests passing
npm run build   # TypeScript compile
npm run lint    # Biome check
```

## 📂 Project Structure

```
composable-agents/
├── packages/
│   ├── core/           # The library
│   │   ├── src/
│   │   │   ├── runtime/      # Controller, engines, signal bus
│   │   │   ├── context/      # Scope, cabinet, blackboard
│   │   │   ├── types/        # TypeScript interfaces
│   │   │   ├── agents/       # Built-in agents
│   │   │   ├── conditions/   # Built-in condition evaluators
│   │   │   └── loader/       # YAML/JSON agent loading
│   │   └── tests/            # 146 tests
│   └── cli/            # CLI tools
├── examples/
│   ├── image-resizer/  # Multi-agent image processing
│   └── story-writer/   # LLM story generation pipeline
├── schemas/            # JSON Schemas
├── skills/             # Pi skills
├── SPEC.md             # Implementation contract
└── AGENTS.md           # Session instructions
```

## 🤝 Contributing

See [AGENTS.md](AGENTS.md) for project conventions.

## 📄 License

MIT

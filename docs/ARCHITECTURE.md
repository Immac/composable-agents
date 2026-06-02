# Architecture

> **Stability:** These interfaces form the "never changes" list. After v1.0, breaking changes require a major version bump.

## Overview

Composable Agents is a **deterministic runtime for non-deterministic agents**. It provides three axioms from which all agent patterns are composed.

```
┌──────────────────────────────────────────────────┐
│  SHIPPED PATTERNS (derived from axioms)          │
│                                                  │
│  Pipeline · Composite · Reflexive · Learning     │
│  + any future pattern users build                │
├──────────────────────────────────────────────────┤
│  AXIOMS (runtime primitives)                     │
│                                                  │
│  Sequence  — ordered and parallel execution      │
│  Signal    — events across the execution         │
│  Condition — synchronous state queries           │
├──────────────────────────────────────────────────┤
│  STORAGE                                         │
│                                                  │
│  Blackboard — typed working state (now)          │
│  Cabinet    — namespaced artifacts (stored)      │
└──────────────────────────────────────────────────┘
```

---

## Axioms

### Sequence

Ordered execution of agents. Steps can be singular, sequential groups, or parallel groups with isolated cabinets.

```typescript
type PipelineStep =
  | { agent: string }
  | { sequence: PipelineStep[] }
  | { parallel: { run: []; join: 'all'; merge: { cabinet: 'namespaced' } } };
```

**Properties:**
- Steps run in declared order
- Parallel branches get isolated cabinets — no cross-writes
- Signals from parallel branches are ordered by declaration
- Conditions evaluate against pre-join scope state
- Each scope supports snapshot/rollback

### Signal

Events flowing orthogonally to the execution sequence. Signals carry typed payloads and can be emitted, subscribed, and routed.

```typescript
interface Signal {
  type: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
}
```

Signal types include: reflex actions, lessons, warnings, telemetry.

### Condition

Synchronous predicates that query a scope's blackboard + cabinet. Composable via `and`/`or`/`not`.

```typescript
type Condition =
  | { type: string; params?: Record<string, unknown> }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };
```

---

## Storage Model

### Blackboard

Typed working state. What is happening **now**.

| Field | Type | Purpose |
|-------|------|---------|
| `identity` | `{ name, constraints, values }` | Who the system is |
| `task` | `{ input, goal, status, output?, error? }` | What it's doing |
| `warnings` | `string[]` | Cross-cutting alerts |

### Cabinet

Namespaced artifact storage. What agents have **stored**.

```
context.cabinet.put("drafts/v2.md", content)
context.cabinet.get("drafts/v2.md")
context.cabinet.exists("images/output.png")
context.cabinet.query("drafts/*")
```

### Scoping Rules

```
Framework scope           agents see framework blackboard + cabinet
  └─ Composite A scope    agents see A's blackboard + cabinet
       └─ Composite B     agents see B's blackboard + cabinet
```

- Each composite level gets its own blackboard + cabinet
- Primitive agents share their parent scope
- A scope inherits parent data at creation but does NOT see ongoing parent changes
- Visibility is explicit: `visibility.expose` declares what surfaces to the parent
- Without explicit visibility, a composite is a black box

---

## The "Never Changes" List

| Interface | Reason |
|-----------|--------|
| `Agent` | Everything composes through this |
| `AgentManifest` | Agents declare themselves through this |
| `SharedContext` (blackboard + cabinet) | All agents coordinate through this |
| `Condition` | All conditions compose through this |
| `Signal` | All cross-agent communication uses this |
| `LLMProvider` | Backend abstraction |
| `Controller.run()` | Public API entry point |

---

## Agent Sandwich Pattern

The general pattern for building agents:

```
┌─ PRE-CHECKS (deterministic) ──────────────────────┐
│  keyword filters · contract validation             │
│  pre-agent reflexes fire here                      │
└──────────────────┬─────────────────────────────────┘
                   ▼
┌─ CORE (configurable type) ────────────────────────┐
│  llm:   fill template → LLM → parse               │
│  code:  shell/python/TS → capture output          │
│  composite: run sub-pipeline                      │
└──────────────────┬─────────────────────────────────┘
                   ▼
┌─ POST-PROCESSING (deterministic) ─────────────────┐
│  stamp output onto blackboard                      │
│  add warnings / lessons                            │
│  post-agent reflexes fire here                     │
└────────────────────────────────────────────────────┘
```

## Philosophy

> *Anything that can be systematically enforced, will be. LLMs fill only the gaps that cannot be codified.*

- **Deterministic orchestration** — pipeline order, reflex conditions, lesson routing are code, not LLM decisions
- **LLMs are specialized tools** — they write text, analyze semantics, recognize patterns. They do not decide the control flow
- **Context is scoped** — each agent sees only its slice. No context rot
- **Everything is data** — agent declarations, pipeline configs, condition expressions, lesson payloads

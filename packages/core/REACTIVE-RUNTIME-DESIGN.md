# Reactive Runtime Design

## Goal

Add a reactive execution mode alongside the existing `SequenceEngine`.

The reactive runtime should:
- let agents declare reactive triggers in their manifests
- evaluate those triggers against the current scope
- execute newly-triggered agents in priority order
- repeat until no new triggers fire
- plug into `Controller` as an alternative runtime mode

## Design

### 1. Agent-declared triggers

Agents declare reactive behavior in `AgentManifest`:

```ts
reactive?: {
  when: string;
  priority?: number;
}
```

- `when` is a condition expression parsed by `ConditionEngine`
- `priority` defaults to `0`
- cabinet-driven triggers use the existing built-in condition syntax, e.g.
  `cabinet-exists(path=bug/classification)`

This keeps the feature data-driven and reuses the existing Condition axiom.

### 2. ReactiveEngine

Add `ReactiveEngine` under `src/runtime/`.

Responsibilities:
- discover reactive agents from the registered agent map
- parse and evaluate each agent's `reactive.when`
- collect agents whose trigger became true on this pass
- run that batch in descending priority order
- merge child scope changes back into the parent scope
- repeat until no new trigger edges appear

### 3. Convergence semantics

To avoid re-running an agent forever while its trigger stays true, the engine uses
**rising-edge trigger semantics**:

- an agent runs when its trigger is `true` **and** it was `false` on the previous evaluation pass
- if the trigger remains `true`, the agent does not run again
- if the trigger becomes `false` and later `true` again, the agent can run again

This gives deterministic convergence for common cabinet-driven workflows while still
allowing re-activation when state genuinely changes.

A `maxIterations` safeguard prevents endless oscillation.

### 4. Controller integration

Extend `RunOptions` with:

```ts
runtime?: {
  mode?: 'sequence' | 'reactive';
  maxIterations?: number;
}
```

Behavior:
- default remains `sequence`
- `sequence` mode uses `SequenceEngine`
- `reactive` mode uses `ReactiveEngine` over the supplied `agents` map

Existing sequence behavior remains unchanged.

### 5. Testing

Add tests for:
- cabinet-triggered execution
- multi-pass convergence
- priority ordering
- controller runtime selection for reactive mode

No changes to existing sequence semantics are intended.

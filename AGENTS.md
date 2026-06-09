# Composable Agents

Deterministic runtime for composable AI agents.

## Structure

| Path | What |
|------|------|
| `packages/core/` | Library — axioms, runtime, agents |
| `packages/cli/` | CLI — validate, inspect, scaffold, run |
| `docs/` | Architecture, API reference |
| `SPEC.md` | Implementation contract |
| `skills/` | Pi skills for this framework |

## Commands

```bash
cd packages/core && npm test    # 146 tests
cd packages/cli && npx . run pipeline.yaml
```

## Rules

- Three axioms: Sequence, Signal, Condition
- SPEC.md is the contract — don't implement what isn't in it
- Agents use `createAgent(config, deps)` factories, not classes
- Use `.ts` extensions in imports
- Cabinet is the protocol for inter-agent communication
- Conditions are pure queries — no side effects

## Skills

- `/skill:composable-agents-create` — create agents
- `/skill:composable-agents-pipeline` — build pipelines
- `/skill:composable-agents-debug` — investigate issues

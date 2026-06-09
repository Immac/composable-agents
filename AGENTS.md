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
- SPEC.md is the contract
- Everything else is enforced by agents

## Skills

- `/skill:composable-agents-create` — create agents
- `/skill:composable-agents-pipeline` — build pipelines
- `/skill:composable-agents-debug` — investigate issues

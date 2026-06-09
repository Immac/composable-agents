# Composable Agents

Deterministic runtime for composable AI agents.

## Structure

| Path | What |
|------|------|
| `packages/core/` | Library — axioms, runtime, agents |
| `packages/cli/` | CLI — validate, inspect, scaffold, run |
| `docs/` | Architecture, API reference |
| `SPEC.md` | Implementation contract |

## Commands

```bash
cd packages/core && npm test    # 146 tests
cd packages/cli && npx . run pipeline.yaml
```

Rules are enforced by agents. Run the validator to check compliance.

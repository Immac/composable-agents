# Composable Agents — Project Instructions

This project builds the **Composable Agents** framework — a deterministic runtime for composable AI agents.

## Key Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Implementation contract — read before coding. Deviations need user confirmation. |
| `WISHLIST.md` | Out-of-scope ideas. New ideas go here, not in code. |
| `packages/core/` | The library — axioms, runtime, shipped agents |
| `packages/cli/` | CLI tools — validate, inspect, scaffold, trace |
| `skills/` | Pi skills — instructions for working with this framework |
| `schemas/` | JSON Schemas for agent.yaml and pipeline.yaml |

## Quick Commands

```bash
# Core library
cd packages/core
npm test              # Run all tests
npm run build         # TypeScript compile
npm run lint          # Biome check

# CLI
cd packages/cli
npx . validate agents/*/agent.yaml
npx . inspect agents/*/agent.yaml
npx . graph pipelines/default.yaml
```

## Conventions

- Agents are declared in `agents/*/agent.yaml` alongside their code
- Pipelines are in `pipelines/*.yaml`
- Skills are in `skills/*/SKILL.md`
- Everything is data-driven — agent declarations, pipeline configs, condition expressions
- The three axioms are Sequence, Signal, Condition — everything else is derived
- SPEC.md is the contract. Don't implement what isn't in it.
- When the user suggests out-of-scope ideas, reference WISHLIST.md

## Important Rules

- Composite agents must declare `visibility.expose` for parent to see their data
- Empty `learning.channels` array means the agent cannot receive lessons
- Reflexes have 6 timing modes: pre/post agent, pre/post cycle, mid-stream, pre-tool-call
- Conditions are pure queries — no side effects
- Parallel branches get isolated cabinets, merged at join

## Skills

Use `/skill:composable-agents-create` when creating a new agent.
Use `/skill:composable-agents-pipeline` when building or modifying pipeline configs.
Use `/skill:composable-agents-debug` when investigating agent misbehavior.

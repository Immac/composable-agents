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

---

## Procedural Directives (Session History Audit)

### Import Hygiene

- All imports in `packages/core/src/` and `packages/core/tests/` must use `.ts` extensions when importing from other source files (tsconfig has `allowImportingTsExtensions: true`).
- Never mix `require()` and top-level `await` in the same file — Node.js throws `ERR_AMBIGUOUS_MODULE_SYNTAX`. Use ESM `import` exclusively.
- Never use `npx tsx -e` with top-level await — tsx eval mode uses CJS format which does not support it. Always write scripts to a file in the project tree.

### Script Execution

- Test scripts that import project modules must live inside the repository tree, not under `/tmp/`. Relative imports resolve from the script's directory, not the cwd passing-through.
- Write runnable scripts under `examples/<name>/` or a dedicated `scripts/` directory. Use `npx tsx <path>` from the repo root.

### Cabinet & Pipeline Debugging

- Cabinet data is in-memory only during a pipeline run. To inspect agent decisions after completion, either:
  (a) Log the decision string in the agent's `AgentResult.output`, or
  (b) Intercept the agent's `execute()` by wrapping it and reading `cabinet.get(key)` after the call.
- Pre-agent reflex evaluation with `skip-agent` action is NOT wired in the Controller (as of v0.1). Agents that need to self-skip based on cabinet state must check their own preconditions and return early.

### Image Handling

- The `PiProvider` sends prompts via `session.prompt(text)`. Embedded images as `![alt](data:image/...;base64,...)` may or may not reach the model depending on the provider. Verify by checking whether the response reasoning references visual details, not just dimension metadata.
- For guaranteed image support, use a model confirmed to handle images through pi: `opencode-go/mimo-v2.5`, `github-copilot/claude-sonnet-4.6`, `github-copilot/gemini-2.5-pro`.
- The `output/` directory accumulates stale files across runs. Clean before benchmarks: `rm -f output/*.png output/*.jpg`.

### File Operations

- Never use `rm -rf <dir>` with directory wildcards unless you have verified the contents first with `ls -la <dir>`. Prefer targeted file removal.
- When patching existing files with `edit`, keep `oldText` short and unique. If the match fails repeatedly, rewrite the whole file with `write` instead of fighting partial matches.
- The agent `output/` directory is gitignored — commit decisions via `cabinet.put()` or task output strings, not files there.

### Example Dependencies

- The `image-resizer` example requires `sharp` (installed in `packages/core/node_modules/sharp`). Not a core library dependency — only needed for examples.
- Test images for benchmarks live under `/home/immac/Repositories/ai_generation/tools/comfyui/output/Image/2026-02/Anima/` (ComfyUI generated, ~1MP each, 64px-close dimensions).

### Model Selection

- `pi --list-models` shows available LLMs with image support. Key models for this project:
  - `opencode-go/mimo-v2.5` — vision, 1M context, free tier, for image analysis agents
  - `github-copilot/gpt-5-mini` — no vision, fast, for text-only LLM agents
  - `github-copilot/gemini-2.5-pro` — vision, for high-quality image analysis
- `PiProvider` resolves pi SDK from global install at `~/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent` first, then falls back to project `node_modules`.

### Controller Limitations (v0.1)

- Pre-agent reflex evaluation (`timing: pre-agent`) is defined but not evaluated by the Controller — pre-cycle and post-cycle timing work, but per-agent pre/post timing does not trigger reflex actions.
- The `discard-output` and `rollback` reflex actions are handled by the Controller (added during this session) but have limited test coverage.
- The `skip-agent` action from reflexes is not wired. Agents that need conditional execution must handle it internally.

### Dead Code Watch

- The `run-composed.ts` declares a `decisionPath` variable (`output/_decision.json`) that is never written or read. Remove it next refactor pass.
- The `image-resizer/agents/strategy-analyzer/analyze.md` template file is not used by the agent code — prompts are built inline. The file is kept as documentation of the prompt structure.

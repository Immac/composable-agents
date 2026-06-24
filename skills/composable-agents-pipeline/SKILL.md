---
name: composable-agents-pipeline
description: Compose multiple agents into pipelines with sequencing, reflexes, learning loops, and error policies. Use when designing or modifying agent workflows.
---

# Building Pipelines

A pipeline is a sequence of agents executed against a shared scope. Pipelines are declared in YAML and validated before runtime.

## 1. Pipeline structure

```yaml
# pipelines/default.yaml
pipeline:
  - id-agent                 # Simple agent reference
  - agent: job-agent         # Explicit step (allows config)
    config:
      maxTokens: 1024
  - group:                   # Sequential sub-group
      sequence:
        - spellcheck
        - grammar-check
  - group:                   # Parallel group
      type: parallel
      run:
        - image-gen
        - audio-gen
      join: all
      merge:
        cabinet: namespaced
        blackboard:
          task.output: concat
  - learning-agent
```

## 2. Agent reference resolution

Agents are resolved from:
1. Built-in agents (id-agent, job-agent, reflexes-agent, learning-agent, memory-agent)
2. Project agents directory (`agents/*/agent.json`)
3. Absolute paths

Validation cross-references all agent IDs:

```bash
npx composable-agents validate-pipeline pipelines/default.yaml
```

## 3. Adding reflexes

Reflexes are condition-action rules that fire at timing points:

```yaml
reflexes:
  # Block dangerous tool calls
  - timing: pre-tool-call
    condition: "tool-call-name:bloom_flowers"
    action: block
    message: "That tool is not available."

  # Skip agents when there are errors
  - timing: pre-agent
    condition: "has-error"
    action: skip-agent

  # Abort mid-generation on harmful content
  - timing: mid-stream
    condition: "task-contains:harmful"
    action: abort-stream

  # Rollback on critical failure
  - timing: post-agent
    condition: "failed"
    action: rollback
```

### Timing modes

| Timing | When | Can do |
|--------|------|--------|
| `pre-agent` | Before a specific agent | Block the agent entirely |
| `post-agent` | After an agent completes | Discard output, rollback |
| `mid-stream` | During LLM streaming | Abort mid-generation |
| `pre-cycle` | Before pipeline starts | Pre-checks |
| `post-cycle` | After pipeline completes | Aggregation |
| `pre-tool-call` | Before an LLM tool call | Block the call |

## 4. Adding learning loops

```yaml
learning:
  maxCycles: 3
  detectors:
    - repeated-error
    - frequent-reflex
    - empty-output
    - hallucination-detection
    - refused-command

lesson_routing:
  id-agent: log                    # Log lessons, never modify
  job-agent: append-to-suggestions # Save for later review
  reflexes-agent: apply-immediately # Apply new reflexes immediately
  learning-agent: stage-for-review  # Stage meta-lessons for review
```

## 5. Error policies per step

```yaml
pipeline:
  - agent: id-agent
    onError: halt                  # Identity violation → stop everything
  - agent: job-agent
    onError: continue              # Task failure → keep going
  - agent: optional-check
    onError: skip                  # Failure → rollback context, continue
```

## 6. Composite agent visibility

When a composite agent runs an inner pipeline, its parent scope sees nothing unless explicitly declared:

```yaml
# agents/supervisor/agent.json
id: supervisor
type: composite
pipeline:
  - text-generator
  - fact-checker

visibility:
  expose:
    cabinet:
      - from: output/final.md
        as: results/story
    blackboard:
      - from: fact-checker.status
        as: quality.score
```

Without `visibility.expose`, the supervisor appears as a black box — parent sees only `status: success/failed`.

## 7. Validate

```bash
npx composable-agents validate-pipeline pipelines/default.yaml
```

## 8. Run

```bash
npx composable-agents run "Your task" --pipeline pipelines/default.yaml
```

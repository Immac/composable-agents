# Pipelines

Pipelines define the execution topology — which agents run, in what order, with what reflexes and learning configuration.

---

## Basic Pipeline

```yaml
pipeline:
  - id-agent
  - job-agent
  - reflexes-agent
  - learning-agent
```

---

## Sequential Groups

```yaml
pipeline:
  - id-agent
  - group:
      sequence:
        - spellcheck
        - grammar-check
  - learning-agent
```

---

## Parallel Groups

```yaml
pipeline:
  - text-generator
  - group:
      type: parallel
      run:
        - image-gen
        - audio-gen
      join: all
      merge:
        cabinet: namespaced    # Each branch's cabinet is isolated
        blackboard:
          task.output: concat  # Output concatenated from all branches
```

**Parallel execution rules:**
- Each branch gets an **isolated cabinet** — no cross-writes
- **Signals** are ordered by branch declaration order
- **Conditions** evaluate against pre-join scope state
- **Join modes:** `all` (wait for all), `any` (wait for first), `first` (use first result)

---

## Reflexes

```yaml
reflexes:
  - timing: pre-agent
    condition: "has-error"
    action: skip-agent

  - timing: pre-tool-call
    condition: "task-contains(text=rm)"
    action: block
    message: "Destructive commands are blocked"
```

**Timing modes:**

| Timing | When it runs | Can do |
|--------|-------------|--------|
| `pre-agent` | Before a specific agent | Block the agent entirely |
| `post-agent` | After an agent completes | Discard output, trigger rollback |
| `mid-stream` | During LLM streaming | Abort mid-generation |
| `pre-cycle` | Before the pipeline starts | Pre-checks |
| `post-cycle` | After the pipeline completes | Aggregation |
| `pre-tool-call` | Before an LLM tool call | Block the call |

---

## Learning Loops

```yaml
learning:
  maxCycles: 3
  detectors:
    - repeated-error
    - frequent-reflex
    - empty-output
  lesson_routing:
    reflexes-agent: apply-immediately
    job-agent: stage-for-review
    learning-agent: log
```

---

## Error Policies

Per-step error handling:

```yaml
pipeline:
  - agent: id-agent
    onError: halt         # Failure stops everything
  - agent: job-agent
    onError: continue     # Failure continues (context changes kept)
  - agent: optional-step
    onError: skip         # Failure skips (context changes rolled back)
```

---

## Composite Agent Visibility

When a composite agent runs an inner pipeline, the parent scope sees nothing unless explicitly declared:

```yaml
# agents/supervisor/agent.json
visibility:
  expose:
    cabinet:
      - from: output/final.md
        as: results/story
    blackboard:
      - from: quality.score
        as: quality.score
```

Without `visibility.expose`, the composite is a black box — parent sees only `status: success/failed` and `output: string`.

---

## Complete Example

```yaml
pipeline:
  - id-agent
  - job-agent
  - group:
      type: parallel
      run: [image-gen, audio-gen]
      join: all
      merge:
        cabinet: namespaced
  - learning-agent

reflexes:
  - timing: pre-agent
    target: job-agent
    condition: "has-error"
    action: skip-agent

learning:
  maxCycles: 2

lesson_routing:
  reflexes-agent: apply-immediately
  job-agent: stage-for-review
```

## Validation

```bash
npx composable-agents validate-pipeline pipeline.json
npx composable-agents graph pipeline.json
npx composable-agents explain pipeline.json
```

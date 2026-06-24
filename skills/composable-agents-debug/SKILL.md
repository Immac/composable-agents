---
name: composable-agents-debug
description: Debug agent misbehavior — trace condition evaluations, inspect scope state, verify lesson routing, and validate pipeline composition. Use when agents skip steps, conditions don't fire, or lessons go missing.
---

# Debugging Agents

## 1. Validate first

Always start by validating — many issues are caught before runtime:

```bash
# Validate all agent declarations
npx composable-agents validate agents/*/agent.json

# Validate the pipeline
npx composable-agents validate-pipeline pipelines/default.yaml
```

Common validation errors:

| Error | Likely cause |
|-------|--------------|
| Unknown condition evaluator | Typo in condition name. Check CONDITION_LANGUAGE.md |
| Unknown handler | Typo in learning.channels handler name |
| Agent ID not found | Agent not registered or path is wrong |
| Circular pipeline | Composite agent references itself (directly or indirectly) |
| Visibility path mismatch | `visibility.expose.from` pattern doesn't match any cabinet path |

## 2. Trace condition evaluations

Dry-run a pipeline to see which conditions fire:

```bash
npx composable-agents trace pipelines/default.yaml --task "Write a story"
```

Output:

```json
{
  "steps": [
    {
      "agent": "id-agent",
      "conditions": {
        "pre_checks": [
          { "condition": "task-contains:human", "result": false },
          { "condition": "task-contains:execute", "result": false }
        ],
        "post_processing": [
          { "condition": "has-error", "result": false }
        ]
      },
      "result": "success"
    },
    {
      "agent": "job-agent",
      "conditions": {
        "pre_checks": [
          { "condition": "has-error", "result": false, "action": "skip" }
        ]
      },
      "result": "success",
      "lessons": []
    }
  ]
}
```

Filter to a specific condition:

```bash
npx composable-agents trace pipelines/default.yaml --condition "repeated-error"
```

## 3. Inspect scope state at each step

```bash
npx composable-agents trace pipelines/default.yaml --scope
```

Shows blackboard + cabinet state before and after each agent:

```
Step 1/3: id-agent
  Blackboard (before): task.status=pending, warnings=[]
  Blackboard (after):  task.status=pending, warnings=[]  (passed)
  Cabinet (before):    (empty)
  Cabinet (after):     (empty)

Step 2/3: job-agent
  Blackboard (before): task.status=pending, task.input="Write a story"
  Blackboard (after):  task.status=complete, task.output="Once upon..."
  Cabinet (after):     output/story.md
```

## 4. Inspect agent structure

```bash
npx composable-agents inspect agents/my-agent/agent.json
```

Shows the full agent contract:

```json
{
  "id": "my-agent",
  "type": "llm",
  "purpose": "Translate text",
  "conditions": {
    "pre_checks": ["has-error"],
    "post_processing": ["output.empty"]
  },
  "communication": {
    "consumes": ["task", "identity.constraints"],
    "produces": ["task.output", "warning"]
  },
  "learning": {
    "channels": [
      { "type": "modify-prompt", "handler": "apply-immediately" }
    ]
  },
  "visibility": null
}
```

## 5. Graph the pipeline

```bash
npx composable-agents graph pipelines/default.yaml --format dot
```

Produces a DOT graph you can render or pipe to visualization tools. Also supports JSON format for programmatic analysis.

## 6. Explain the pipeline

```bash
npx composable-agents explain pipelines/default.yaml
```

Produces a natural language summary:

> "This pipeline runs 3 agents in sequence. First, id-agent checks the task against identity constraints (halts on violation). Then job-agent executes the task. Finally, learning-agent runs pattern detection and produces lessons for other agents. A pre-agent reflex skips job-agent if id-agent flagged a violation."

## 7. Common debugging scenarios

### Agent was skipped unexpectedly

```bash
# Check which condition caused the skip
npx composable-agents trace pipeline.json --focus skipped
```

### Lessons not reaching their target

```bash
# Check learning channels
npx composable-agents inspect agents/target-agent/agent.json --channels

# Trace lesson routing
npx composable-agents trace pipeline.json --lessons
```

### Cabinet seems empty

```bash
# Check what was stored at each step
npx composable-agents trace pipeline.json --cabinet

# Check visibility rules
npx composable-agents inspect agents/composite-agent/agent.json --visibility
```

### Reflex didn't fire

```bash
# Check condition at the right timing point
npx composable-agents trace pipeline.json --reflexes
# Shows every reflex evaluation, including ones that didn't match
```

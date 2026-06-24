# Agent Format

Agents are declared in JSON (or YAML) files alongside their code. The format is validated against a JSON Schema at load time. JSON is the canonical format; YAML is also supported for backward compatibility.

## Minimal Example (JSON)

```json
{
  "id": "my-agent",
  "type": "llm",
  "version": "0.1.0",
  "purpose": "Translate text from English to Japanese",

  "llm": {
    "prompt_template": "./prompt.md",
    "model": "opencode-go/deepseek4flash",
    "temperature": 0.3
  },

  "learning": {
    "channels": []
  }
}
```

## Minimal Example (YAML)

```yaml
# agents/my-agent/agent.yaml
id: my-agent
type: llm
version: 0.1.0
purpose: "Translate text from English to Japanese"

llm:
  prompt_template: ./prompt.md
  model: opencode-go/deepseek4flash
  temperature: 0.3

learning:
  channels: []
```

## Full Reference (JSON)

```json
{
  "$schema": "https://composable-agents.dev/schemas/agent-v1.json",
  "id": "my-agent",
  "type": "llm",
  "version": "0.1.0",
  "purpose": "Translate text from English to Japanese",

  "deterministic": {
    "pre_checks": [
      { "condition": "has-error", "action": "skip", "message": "Skipping due to error" }
    ],
    "post_processing": [
      { "condition": "output.empty", "action": "retry" }
    ]
  },

  "llm": {
    "prompt_template": "./prompt.md",
    "model": "opencode-go/deepseek4flash",
    "temperature": 0.7
  },

  "learning": {
    "channels": [
      { "type": "modify-prompt", "handler": "apply-immediately" }
    ]
  }
}
```

## Full Reference (YAML)

```yaml
id: my-agent                   # Required. Unique, lowercase kebab-case.
type: llm                      # Required. One of: llm, code, composite
version: 0.1.0                 # Required. Semver.
purpose: "..."                 # Required. One-line description.

deterministic:                 # Optional. Determinstic pre/post checks.
  pre_checks:                  #   Run before the core.
    - condition: "has-error"   #     Condition name or expression.
      action: skip             #     skip | halt | retry | warn | block
      message: "..."           #     Optional message.
  post_processing:             #   Run after the core.
    - condition: "output.empty"
      action: retry

llm:                           # Required if type: llm
  prompt_template: ./prompt.md #   Path to prompt template file.
  model: opencode-go/deepseek4flash  # Model identifier.
  temperature: 0.7             #   Sampling temperature (0.0-2.0).

code:                          # Required if type: code
  entrypoint: ./index.ts       #   Path to code entrypoint.
  timeout: 30000               #   Execution timeout in ms.

pipeline:                      # Required if type: composite
  - sub-agent-1                #   List of sub-agent IDs or steps.
  - agent: sub-agent-2
    config:
      maxTokens: 1024

communication:                 # Optional. Input/output contracts.
  consumes:
    - event: task
    - event: identity.constraints
  produces:
    - event: task.output
    - event: warning

learning:                      # Required (can be empty).
  channels:                    #   How this agent receives lessons.
    - type: modify-prompt      #     Channel type identifier.
      handler: apply-immediately  #     Handler: apply-immediately | 
                                 #              stage-for-review |
                                 #              append-to-suggestions | log

visibility:                    # Required if type: composite.
  expose:                      #   What to expose to parent scope.
    cabinet:                   #     Cabinet paths to surface.
      - from: output/*         #       Pattern in child cabinet.
        as: results/           #       Namespace in parent cabinet.
    blackboard:                #     Blackboard fields to surface.
      - from: phase            #       Child field path.
        as: pipeline.phase     #       Parent field path.
```

## Agent Types

| Type | When to use | Implementation |
|------|-------------|----------------|
| `llm` | Task needs language understanding, generation, or semantic analysis | Prompt template (`.md`) with template variables |
| `code` | Task is deterministic — validation, transformation, checking | Code module exporting `execute()` function |
| `composite` | Task decomposes into sub-agents | Pipeline config referencing other agent IDs |

## Template Variables

LLM prompt templates support these built-in variables:

| Variable | Source |
|----------|--------|
| `{{agent.id}}` | agent.json `id` |
| `{{agent.purpose}}` | agent.json `purpose` |
| `{{task.input}}` | Blackboard task input |
| `{{task.goal}}` | Blackboard task goal |
| `{{constraints}}` | Blackboard identity constraints |

## Validation

```bash
npx composable-agents validate agents/my-agent/agent.json
```

Output is structured JSON with fix suggestions:

```json
{
  "valid": false,
  "file": "agents/my-agent/agent.json",
  "errors": [
    {
      "path": "learning.channels",
      "message": "Missing required field: learning.channels",
      "fix": "Add 'learning: { channels: [] }' to your agent declaration"
    }
  ]
}
```

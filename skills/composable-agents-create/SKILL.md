---
name: composable-agents-create
description: Create a new agent for the Composable Agents framework. Walks through declaring the agent, implementing its logic (LLM prompt, code, or sub-pipeline), and validating before use.
---

# Creating an Agent

An agent is a self-contained directory with an `agent.json` declaration and an implementation file.

## 1. Choose the agent type

| Type | When to use | Implementation |
|------|-------------|----------------|
| `llm` | Task needs language understanding, generation, or semantic analysis | Prompt template (`.md`) |
| `code` | Task is deterministic — validation, transformation, checking, echoing, simple logic | Code module (`.ts`) |
| `composite` | Task decomposes into sub-agents | Pipeline config referencing other agents |

**Default to `code` for simple tasks.** If the agent just transforms data, echoes input, validates something, or runs a fixed algorithm — use `code`. Only use `llm` when the task genuinely needs language understanding.

## 2. Scaffold

```bash
# LLM agent
npx composable-agents scaffold llm-agent agents/my-agent

# Code agent
npx composable-agents scaffold code-agent agents/my-agent

# Composite agent
npx composable-agents scaffold composite-agent agents/my-agent
```

Each scaffold command creates:

```
agents/my-agent/
├── agent.json       # Declaration (edit this, JSON)
├── prompt.md        # LLM prompt template (llm type only)
└── index.ts         # Code entrypoint (code type only)
```

## 3. Fill in the agent.json

```json
{
  "$schema": "https://composable-agents.dev/schemas/agent-v1.json",
  "id": "my-agent",
  "type": "llm",
  "version": "0.1.0",
  "purpose": "Describe what this agent does in one line",

  "deterministic": {
    "pre_checks": [
      { "condition": "has-error", "action": "skip" }
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
    "channels": []
  }
}
```
id: my-agent
type: llm
version: 0.1.0
purpose: "Describe what this agent does in one line"

deterministic:
  pre_checks:
    - condition: "has-error"
      action: skip
  post_processing:
    - condition: "output.empty"
      action: retry

llm:
  prompt_template: ./prompt.md
  model: opencode-go/deepseek4flash
  temperature: 0.7

learning:
  channels:
    - type: modify-prompt
      handler: apply-immediately
```

### Key fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Unique, lowercase kebab-case |
| `type` | Yes | `llm`, `code`, or `composite` |
| `purpose` | Yes | One line — shown in pipeline configs and introspection |
| `deterministic.pre_checks` | No | Conditions checked before the core runs |
| `deterministic.post_processing` | No | Conditions checked after the core runs |
| `llm` | If type=llm | Model, prompt template, temperature |
| `code` | If type=code | Entrypoint file, timeout |
| `pipeline` | If type=composite | List of sub-agent IDs or steps |
| `learning.channels` | Yes (can be empty) | How this agent receives lessons |
| `visibility` | If type=composite | What data to expose to parent scope |

## 4. Write the prompt (LLM agents)

The prompt template is a Markdown file with variables:

```markdown
You are {{agent.id}}. Your purpose is {{agent.purpose}}.

Identity constraints:
{{constraints}}

Task: {{task.input}}
Goal: {{task.goal}}

Respond with your analysis only.
```

Built-in variables available in all templates:

| Variable | Source |
|----------|--------|
| `{{agent.id}}` | agent.json id |
| `{{agent.purpose}}` | agent.json purpose |
| `{{task.input}}` | Blackboard task input |
| `{{task.goal}}` | Blackboard task goal |
| `{{constraints}}` | Blackboard identity constraints |

## 5. Write the code (code agents)

Export an async `execute` function:

```typescript
import type { Agent, SharedContext } from 'composable-agents';

export async function execute(
  scope: SharedContext,
  signal?: AbortSignal,
): Promise<{ status: string; output?: string; error?: string }> {
  // Read from blackboard
  const input = scope.task.input;

  // Read from cabinet
  const previous = scope.cabinet.get("drafts/latest");

  // Write to blackboard
  scope.setTaskOutput(result);

  // Write to cabinet
  scope.cabinet.put("results/output.json", data);

  return { status: "success", output: result };
}
```

## 6. Validate

```bash
npx composable-agents validate agents/my-agent/agent.json
```

Fix any errors. The output includes structured fix suggestions.

## 7. Register in a pipeline

Add your agent to a pipeline.json:

```json
{
  "name": "default",
  "pipeline": [
    "id-agent",
    "my-agent",
    "learning-agent"
  ]
}
```

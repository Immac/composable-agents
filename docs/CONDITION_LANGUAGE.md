# Condition Language

Conditions are synchronous predicates that query a scope's state. They are the decision mechanism for reflexes, pre-checks, and post-processing.

---

## Built-in Evaluators

| Evaluator | Params | Description |
|-----------|--------|-------------|
| `has-output` | — | True when `task.output` is defined |
| `has-error` | — | True when `task.error` is defined |
| `complete` | — | True when `task.status === 'complete'` |
| `failed` | — | True when `task.status === 'failed'` |
| `has-warnings` | — | True when `warnings.length > 0` |
| `repeated-error` | `threshold` (default: 3) | True when error warnings count ≥ threshold |
| `cabinet-exists` | `path` (glob) | True when cabinet has entries matching the path |
| `warnings-count` | `threshold` (default: 1) | True when warnings.length ≥ threshold |
| `task-contains` | `text` | True when task input or goal contains the text |
| `signal-received` | `type` | True when a signal of that type was emitted (runtime) |

---

## Composition

Conditions compose via `and`/`or`/`not` trees:

### Structured format (YAML)

```yaml
condition:
  and:
    - has-output
    - not: has-error
```

```yaml
condition:
  and:
    - task-contains(text=urgent)
    - or:
        - has-warnings
        - repeated-error(threshold=2)
```

### String expression format

```
has-output AND NOT has-error
task-contains(text=urgent) AND (has-warnings OR repeated-error(threshold=2))
NOT complete
```

String expressions are parsed into the same structured tree. Both forms are equivalent.

---

## Parameter Syntax

Parameters can be specified in two ways:

### Structured

```yaml
condition:
  type: repeated-error
  params:
    threshold: 5
```

### Inline (string expression)

```
repeated-error(threshold=5)
cabinet-exists(path=drafts/*.md)
task-contains(text=urgent)
```

Multiple parameters use comma separation:

```
my-condition(a=1, b=hello)
```

---

## Registering Custom Evaluators

```typescript
import { ConditionEngine } from 'composable-agents';

const engine = new ConditionEngine();
engine.register({
  type: 'my-custom-check',
  description: 'True when the cabinet has enough drafts',
  evaluate: (params, scope) => {
    const minDrafts = (params?.minDrafts as number) ?? 1;
    return scope.cabinet.query('drafts/*').length >= minDrafts;
  },
});
```

---

## Usage in Agent Declarations

```yaml
deterministic:
  pre_checks:
    - condition: "has-error"
      action: skip

reflexes:
  - timing: pre-agent
    condition: "repeated-error(threshold=3)"
    action: abort-agent
```

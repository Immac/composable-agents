# Composable Agents — Wishlist

> **Purpose:** Capture ideas that are intentionally OUT of scope for v1.0 but worth revisiting later.  
> **Rule:** No item here blocks v1.0. No item here is promised. They're ideas, not requirements.  
> **When you suggest something during implementation and I say "that's out of scope," it goes here.**

---

## P1 — LLM-Driven Learning Agent

The current Learning Agent uses hardcoded rule detectors (repeated-error, frequent-reflex, etc.). An LLM-driven version would read the full pipeline history and produce richer, context-aware lessons.

Replaces `detectors: []` with a prompt template:

```yaml
learning:
  mode: llm
  prompt_template: |
    Analyze the following pipeline history and identify patterns:
    {{history}}
    
    Produce lessons for: {{agents}}
  model: opencode-go/deepseek4flash
```

**Blocks on:** Nothing — could be added as an alternative learning mode alongside the rule-based one.

---

## P1 — Muscle Memory Agent (Procedural Compilation)

A system agent that detects repetitive action sequences and compiles them into scripts (shell, Python, JS), reducing LLM usage for routine tasks.

Behavior:
1. Monitor `cabinet.query("history/*")` for repeated sequences
2. When same sequence appears N+ times, generate a script
3. Store script in cabinet under `scripts/`
4. Emit a lesson to the Reflexes Agent: "add reflex matching this pattern, run script instead"

**Blocks on:** Stable history tracking, script execution sandbox.

---

## P2 — Multi-Session Persistence

Currently all state is in-memory. A persistence layer would let lessons accumulate across sessions, and identity profiles persist.

```yaml
storage:
  cabinet: sqlite://~/.composable-agents/cabinet.db
  blackboard: ephemeral  # or persisted per session
```

**Blocks on:** Core axioms being stable. Serialization format for cabinet contents.

---

## P2 — Visual Pipeline Debugger

A TUI or web view showing:
- Agent execution order (real-time)
- Which conditions fired and why
- Lesson routing decisions
- Cabinet contents per scope
- Parallel branch status

**Blocks on:** CLI being stable. Could be a separate package.

---

## P2 — Agent Marketplace / Registry

A directory of reusable agent declarations. Users publish:

```yaml
# published-agent/agent.yaml
id: spellchecker
registry: composable-agents.com/community
version: 1.2.0
```

The loader could resolve `from: registry` imports.

**Blocks on:** YAML loader being stable. Needs a hosting story.

---

## P2 — Rust Bridge for Hot Paths

Like personality-core's `personality-bridge` — compile the condition engine and sequence engine to Rust for performance-critical paths. The TypeScript reference implementation is fine for development; Rust is for production.

**Blocks on:** Condition and Sequence axioms being absolutely stable (they'd be frozen by the Rust bindings).

---

## P3 — Recursive Self-Improvement

The Learning Agent has learning channels (it can receive lessons too). If the Learning Agent could modify its own detection rules via its own learning channels, it would be self-improving:

```
Learning Agent detects: "I keep missing patterns of type X"
  → produces lesson for: Learning Agent itself
  → handler: modify my own detector config
  → next cycle: better at detecting
```

This is theoretically possible with the current architecture — the Learning Agent is just another agent with learning channels. But the rule-based detector system would need to support runtime modification.

**Blocks on:** LLM-driven Learning Agent (P1) would make this much more useful.

---

## P3 — Format Negotiation Between Agents

Currently the Learning Agent produces lessons, and the Controller tries to route them by type. If the target doesn't have a matching channel, the lesson is stored in context (unread).

A negotiation protocol would let agents declare:

```yaml
teaching:
  produces:
    - format: reflex-def
    - format: prompt-patch
learning:
  accepts:
    - format: reflex-def
    - format: prompt-patch
```

Controller matches producer formats to consumer channels. Mismatches logged.

**Blocks on:** Lesson system being stable, multi-agent pipelines being common.

---

## P3 — Composite Agent Contract Testing

When composite agents are shared/reused, the parent scope needs guarantees about the child's behavior. Contract tests:

```yaml
# composite agent.yaml
contract:
  guarantees:
    - "If task.status === 'complete', then cabinet.exists('output/*')"
    - "Never writes to warnings about 'deprecated'"
  requires:
    - "blackboard.task.input is non-empty"
```

Runtime-contract checking (opt-in) for debugging.

**Blocks on:** Composite scoping stable, real use cases emerging.

---

## P3 — Parallel Branch Migration

If a parallel branch is running long and another branch finishes early, could the framework migrate work between branches? E.g., "branch A is stuck, re-route its task to branch B."

This would require the ability to snapshot a running branch's cabinet and reassign it.

**Blocks on:** Parallel execution being stable. Use cases that need it (extremely long-running branches).

---

## P3 — Persistent Cabinet (File-Backed Long-Term Storage)

The v1.0 cabinet is in-memory and scoped to a run. A persistent cabinet would let agents store and retrieve data across sessions:

```typescript
context.cabinet.put("user/preferences.json", prefs, { persist: true });
```

Backed by a configurable store (local JSON, SQLite, S3).

**Blocks on:** Core cabinet API stable, need for cross-session state in real use cases.

---

## P3 — Python / Other Language Agent Runtimes

Currently agents must be TypeScript. A multi-language runtime would let you write agents in Python, Go, or shell and register them the same way.

```yaml
id: resize-images
type: code
code:
  entrypoint: python3 ./resize.py
  runtime: python:3.12
```

**Blocks on:** Code runner abstraction stable, real need for non-TS agents.

---

## P3 — Distributed Execution

Multiple pipeline steps running on different machines. The Controller coordinates via message queue instead of in-process function calls.

**Blocks on:** Everything. This is an entirely different class of system.

---

## P3 — Agent YAML Extension Tags

Custom YAML tags for agent declarations:

```yaml
condition: !ref inherited-conditions/security
llm: !include ./prompts/base.yaml
```

YAML supports custom tags. The loader could resolve them.

**Blocks on:** YAML loader stable, real need for DRY in agent configs.

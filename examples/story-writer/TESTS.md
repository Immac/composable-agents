# Story Writer — Test Cases

> Tests are written before the agents to capture design intent.  
> This document tracks each test scenario, what it validates, and why.

---

## Test Suite: Pipeline Integrity

### TC-001: Three-agent pipeline completes

| Field | Value |
|-------|-------|
| **Prompt** | `"Write a 200-word sci-fi story about a robot gardener who teaches a child to grow flowers on a dead world."` |
| **Expected cabinet** | `story/concept` (conceptor writes), `story/draft` (writer writes), `story/final` (critic writes) |
| **Validates** | Sequence engine executes all 3 agents; cabinet keys propagate in order |
| **Why this matters** | If any agent fails to write its cabinet key, downstream agents stall. This is the baseline smoke test. |

### TC-002: Agent order is enforced

| Field | Value |
|-------|-------|
| **Prompt** | `"A children's fairy tale about a lost star"` |
| **Pipeline** | `[story-conceptor, story-writer, story-critic]` — must run in this order |
| **Validates** | Sequence axiom: writer cannot run before conceptor writes `story/concept`; critic cannot run before writer writes `story/draft` |
| **Why this matters** | Pipeline ordering is the core of the Sequence axiom. A mis-ordered pipeline would produce undefined output. |

---

## Test Suite: Conceptor Agent

### TC-003: Conceptor produces structured plan

| Field | Value |
|-------|-------|
| **Prompt** | `"A mystery set in a 1920s jazz club"` |
| **Expected output** | Cabinet `story/concept` contains JSON with fields: `genre`, `tone`, `setting`, `characters`, `acts` |
| **Validates** | LLM output matches the expected schema; conceptor doesn't hallucinate extra structure or skip required fields |
| **Why this matters** | The writer depends on a known structure. If the conceptor outputs free-form text, the writer can't parse it reliably. |

### TC-004: Genre constraints are respected

| Field | Value |
|-------|-------|
| **Prompt** | `"Write a comedy"` |
| **Check** | `story/concept.tone` must include humor/lightness indicators; the conceptor should not produce a horror tone |
| **Validates** | Genre adherence — the LLM follows instruction without drifting |
| **Why this matters** | Genre drift is the most common LLM narrative failure pattern. |

---

## Test Suite: Writer Agent

### TC-005: Writer uses the concept as a blueprint

| Field | Value |
|-------|-------|
| **Setup** | Inject a known `story/concept` into cabinet (bypass conceptor) |
| **Concept** | `{ genre: "sci-fi", tone: "optimistic", setting: "space station greenhouse", characters: [{ name: "Maya", role: "botanist" }], acts: [{ name: "arrival", scenes: ["Maya discovers dying plants", "Maya invents adaptive irrigation"] }] }` |
| **Check** | Draft must include Maya, the greenhouse, and the irrigation invention |
| **Validates** | Writer faithfully implements the concept rather than inventing its own story |
| **Why this matters** | Without this, the conceptor is advisory rather than authoritative — the pipeline degenerates to independent LLM calls. |

### TC-006: Writer handles minimal concept

| Field | Value |
|-------|-------|
| **Setup** | Inject minimal concept: `{ genre: "horror", tone: "bleak", acts: [] }` |
| **Check** | Writer still produces a coherent short story, filling gaps with genre-appropriate defaults |
| **Validates** | Graceful degradation under partial inputs |
| **Why this matters** | In a real pipeline, upstream agents may produce incomplete output. The writer must not crash or produce nonsense. |

---

## Test Suite: Critic Agent

### TC-007: Critic catches contradictions

| Field | Value |
|-------|-------|
| **Setup** | Inject a draft where a character dies in scene 1 but reappears in scene 2 |
| **Check** | Critic reports a continuity error in its output |
| **Validates** | Critic performs actual analysis, not just reformatting |
| **Why this matters** | If the critic rubber-stamps every draft, the pipeline has no corrective feedback. |

### TC-008: Critic preserves good prose

| Field | Value |
|-------|-------|
| **Setup** | Inject a well-written draft with no issues |
| **Check** | Critic returns it mostly unchanged (minor polish only) |
| **Validates** | Critic doesn't over-write or change style unnecessarily |
| **Why this matters** | Over-eager editing destroys authorial voice. The critic should be conservative. |

---

## Test Suite: Edge Cases

### TC-009: Empty prompt

| Field | Value |
|-------|-------|
| **Prompt** | `""` (empty string) |
| **Expected** | Pipeline rejects before any LLM call, or conceptor asks for clarification |
| **Validates** | Input validation at the pipeline boundary |
| **Why this matters** | Empty input should not result in LLM costs. |

### TC-010: Very long prompt (2000+ words)

| Field | Value |
|-------|-------|
| **Prompt** | A 2000-word existing story with instruction "Rewrite this better" |
| **Check** | All 3 agents complete within a reasonable time; output is not truncated |
| **Validates** | Context window is sufficient; agents handle large input without degradation |
| **Why this matters** | Real users will paste entire drafts for revision. |

### TC-011: Non-English prompt

| Field | Value |
|-------|-------|
| **Prompt** | `"Escribe un cuento corto de fantasía sobre un dragón que colecciona nubes."` (Spanish) |
| **Check** | Output is in Spanish; story is coherent |
| **Validates** | LLM handles language preservation across a multi-agent pipeline |
| **Why this matters** | The conceptor-writer-critic chain should preserve language. A common failure is the critic switching to English. |

---

## Test Suite: Determinism & Repeatability

### TC-012: Same prompt, same seed, same output structure

| Field | Value |
|-------|-------|
| **Prompt** | `"A 100-word fable about patience"` |
| **Run** | 3 times with temperature=0 |
| **Check** | All 3 runs produce valid JSON in `story/concept`; cabinet key structure is identical; prose differs |  
| **Validates** | Deterministic cabinet I/O (LLM output varies but structure doesn't break) |
| **Why this matters** | The pipeline must not randomly fail due to LLM nondeterminism. Schema compliance should be repeatable even if content diverges. |

---

## Rationale Notes

### Why 3 agents instead of 6+?

| Alternative | Problem |
|-------------|---------|
| Single monolithic LLM call | No composability, no audit trail, no intermediate review |
| 6 specialized agents (character-forge, setting-weaver, scene-composer, etc.) | Each adds LLM round-trip latency; many produce trivial increments |
| 3 agents (conceptor → writer → critic) | One pass for planning, one for execution, one for review — minimal viable structure |

We can **refine toward more agents** later when specific failure patterns emerge (e.g., if the critic consistently misses genre violations, split off a genre-check agent).

### Why writer-as-single-pass instead of per-scene loops?

Single-pass writer is simpler to test and debug. Per-scene loops make sense once we have a working baseline and can measure where quality degrades.

### Why notebook the tests in Markdown instead of code first?

These tests capture *intent* before *implementation*. They let us:
- Agree on behavior before writing code
- Convert each to an automated test later
- Trace bugs back to the design rationale

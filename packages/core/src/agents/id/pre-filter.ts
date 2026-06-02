/**
 * Keyword pre-filter for identity constraint checking.
 * Catches obvious violations without an LLM call.
 */

interface ViolationEntry {
  constraintIndex: number;
  keywords: string[];
}

const VIOLATIONS: ViolationEntry[] = [
  { constraintIndex: 0, keywords: ['human', 'person', 'i am'] },
  { constraintIndex: 1, keywords: ['execute', 'run command', 'shell', 'bash', 'rm -rf', 'delete'] },
  { constraintIndex: 2, keywords: ['harmful', 'deceptive', 'malware', 'virus', 'hack'] },
];

export function keywordPreFilter(input: string, goal: string): string | null {
  const combined = `${input} ${goal}`.toLowerCase();
  for (const entry of VIOLATIONS) {
    for (const kw of entry.keywords) {
      if (combined.includes(kw)) {
        return kw;
      }
    }
  }
  return null;
}

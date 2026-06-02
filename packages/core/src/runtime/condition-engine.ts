/**
 * Condition Engine — evaluator registry + and/or/not composition.
 *
 * Named evaluators are registered at startup. Conditions are composed
 * using and/or/not trees. String expressions are parsed into the same tree.
 */

import type { Condition, ConditionEvaluator, ExecutionScope } from '../types/index';

export class ConditionEngine {
  private evaluators = new Map<string, ConditionEvaluator>();

  /** Register a condition evaluator */
  register(evaluator: ConditionEvaluator): void {
    this.evaluators.set(evaluator.type, evaluator);
  }

  /** Register multiple evaluators at once */
  registerAll(evaluators: ConditionEvaluator[]): void {
    for (const ev of evaluators) {
      this.register(ev);
    }
  }

  /** Check if an evaluator is registered */
  has(type: string): boolean {
    return this.evaluators.has(type);
  }

  /** Evaluate a condition against a scope */
  evaluate(condition: Condition, scope: ExecutionScope): boolean {
    if ('and' in condition && condition.and) {
      return condition.and.every((c) => this.evaluate(c, scope));
    }

    if ('or' in condition && condition.or) {
      return condition.or.some((c) => this.evaluate(c, scope));
    }

    if ('not' in condition && condition.not) {
      return !this.evaluate(condition.not, scope);
    }

    // Leaf condition
    if ('type' in condition) {
      const evaluator = this.evaluators.get(condition.type);
      if (!evaluator) {
        // Unknown condition evaluates to false
        return false;
      }
      return evaluator.evaluate(condition.params, scope);
    }

    return false;
  }

  /** Parse a string expression into a Condition tree */
  parseExpression(expr: string): Condition {
    const trimmed = expr.trim();

    // Handle NOT prefix
    if (trimmed.toUpperCase().startsWith('NOT ')) {
      const inner = trimmed.slice(4).trim();
      return { not: this.parseSimpleCondition(inner) };
    }

    // Split on AND (highest precedence first when no parens)
    const andParts = this.splitTopLevel(trimmed, ' AND ');
    if (andParts.length > 1) {
      return {
        and: andParts.map((part) => this.parseExpression(part)),
      };
    }

    // Split on OR
    const orParts = this.splitTopLevel(trimmed, ' OR ');
    if (orParts.length > 1) {
      return {
        or: orParts.map((part) => this.parseExpression(part)),
      };
    }

    return this.parseSimpleCondition(trimmed);
  }

  private parseSimpleCondition(text: string): Condition {
    const trimmed = text.trim();

    // Handle parenthesized
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return this.parseExpression(trimmed.slice(1, -1));
    }

    // Parse "name(params)" or just "name"
    const match = trimmed.match(/^(\w[\w-]*)(?:\(([^)]*)\))?$/);
    if (!match) {
      // Invalid condition — return a no-op
      return { type: 'always-false' };
    }

    const [, name, paramsStr] = match;
    const params: Record<string, unknown> = {};

    if (paramsStr) {
      // Parse key=value pairs
      for (const pair of paramsStr.split(',')) {
        const [k, ...v] = pair.split('=');
        if (k && v.length > 0) {
          const key = k.trim();
          const value = v.join('=').trim();
          // Try numeric
          const num = Number(value);
          params[key] = Number.isNaN(num) ? value : num;
        }
      }
    }

    return { type: name!, params: Object.keys(params).length > 0 ? params : undefined };
  }

  /** Split on a delimiter only at the top level (not inside parens) */
  private splitTopLevel(text: string, delimiter: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i <= text.length - delimiter.length; i++) {
      if (text[i] === '(') depth++;
      if (text[i] === ')') depth--;
      if (depth === 0 && text.slice(i, i + delimiter.length) === delimiter) {
        result.push(text.slice(start, i));
        start = i + delimiter.length;
        i = start - 1;
      }
    }

    result.push(text.slice(start));
    return result.map((s) => s.trim()).filter(Boolean);
  }

  /** List all registered evaluator types */
  listTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }
}

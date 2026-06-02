/**
 * Signal Bus — typed event bus for inter-agent communication.
 *
 * Signals flow orthogonally to the execution sequence. The bus
 * handles subscriptions, reflex dispatch, and lesson routing.
 */

import type { Signal, SignalBus, SignalHandler, ReflexRule, Lesson } from '../types/index.ts';

export class SignalBusImpl implements SignalBus {
  private handlers = new Map<string, Set<SignalHandler>>();
  private signalHistory: Signal[] = [];

  /** Emit a signal to all subscribers */
  emit(signal: Signal): void {
    this.signalHistory.push(signal);

    const handlers = this.handlers.get(signal.type);
    if (handlers) {
      for (const handler of handlers) {
        Promise.resolve(handler(signal)).catch(() => {
          // Swallow handler errors in MVP
        });
      }
    }

    // Also dispatch to wildcard subscribers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        Promise.resolve(handler(signal)).catch(() => {});
      }
    }
  }

  /** Subscribe to a signal type. Returns unsubscribe function. */
  on(type: string, handler: SignalHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.off(type, handler);
  }

  /** Unsubscribe a handler */
  off(type: string, handler: SignalHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  /** Clear all subscriptions and history */
  clear(): void {
    this.handlers.clear();
    this.signalHistory = [];
  }

  /** Get signal history (for inspection, learning) */
  getHistory(): Signal[] {
    return [...this.signalHistory];
  }

  /** Check if a signal of a given type has been emitted */
  hasReceived(type: string): boolean {
    return this.signalHistory.some((s) => s.type === type);
  }

  /** Count signals of a given type */
  count(type: string): number {
    return this.signalHistory.filter((s) => s.type === type).length;
  }
}

/**
 * Reflex Engine — evaluates reflexes and dispatches actions.
 *
 * Separated from SignalBus because reflexes are evaluated
 * at specific timing points during the pipeline, not as event handlers.
 */
export class ReflexEngine {
  private rules: ReflexRule[] = [];

  addRule(rule: ReflexRule): void {
    this.rules.push(rule);
  }

  addRules(rules: ReflexRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  getRules(timing?: string): ReflexRule[] {
    if (timing) {
      return this.rules.filter((r) => r.timing === timing);
    }
    return [...this.rules];
  }

  /**
   * Evaluate all reflexes for a given timing point.
   * Returns actions that should be taken by the caller.
   */
  evaluate(
    timing: string,
    targetAgent: string,
    evaluateCondition: (condition: string) => boolean,
  ): ReflexAction[] {
    const actions: ReflexAction[] = [];

    for (const rule of this.rules) {
      if (rule.timing !== timing) continue;
      if (rule.target && rule.target !== targetAgent) continue;

      if (evaluateCondition(rule.condition)) {
        rule.triggerCount++;
        actions.push({
          ruleId: rule.id,
          action: rule.action,
          message: rule.message,
        });
      }
    }

    return actions;
  }
}

export interface ReflexAction {
  ruleId: string;
  action: string;
  message?: string;
}

/**
 * Lesson Router — routes lessons by type to target agent handlers.
 */
export class LessonRouter {
  private handlerMap = new Map<string, (lesson: Lesson) => Promise<void>>();

  register(targetAgentId: string, handler: (lesson: Lesson) => Promise<void>): void {
    this.handlerMap.set(targetAgentId, handler);
  }

  async route(lesson: Lesson): Promise<boolean> {
    const handler = this.handlerMap.get(lesson.target);
    if (!handler) return false; // No handler for this target — lesson stored in context
    await handler(lesson);
    return true;
  }

  async routeAll(lessons: Lesson[]): Promise<RoutingResult[]> {
    const results: RoutingResult[] = [];
    for (const lesson of lessons) {
      const delivered = await this.route(lesson);
      results.push({ lessonId: lesson.id, delivered });
    }
    return results;
  }
}

export interface RoutingResult {
  lessonId: string;
  delivered: boolean;
}

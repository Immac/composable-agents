/**
 * Signal — events flowing orthogonally to the execution sequence.
 *
 * Signals include reflex actions, lessons, warnings, and telemetry.
 * The signal bus interface is carved from day one; the MVP uses it
 * for reflexes and lessons.
 */

export interface Signal {
  type: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
}

export type SignalHandler = (signal: Signal) => void | Promise<void>;

export interface SignalBus {
  emit(signal: Signal): void;
  on(type: string, handler: SignalHandler): () => void; // returns unsubscribe
  off(type: string, handler: SignalHandler): void;
  clear(): void;
}

// ─── Reflex System ──────────────────────────────────────────────────

export type TimingMode =
  | 'pre-agent'
  | 'post-agent'
  | 'mid-stream'
  | 'pre-cycle'
  | 'post-cycle'
  | 'pre-tool-call';

export type ReflexAction =
  | 'abort-agent'
  | 'abort-stream'
  | 'skip-agent'
  | 'discard-output'
  | 'block'
  | 'rollback'
  | 'warn';

export interface ReflexRule {
  id: string;
  timing: TimingMode;
  condition: string; // condition name or expression
  action: ReflexAction;
  target?: string;
  message?: string;
  triggerCount: number;
}

// ─── Lesson System ──────────────────────────────────────────────────

export interface Lesson {
  id: string;
  type: string;
  source: string;
  target: string;
  payload: unknown;
  confidence: number;
  evidence: string[];
  timestamp: number;
}

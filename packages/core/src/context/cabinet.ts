/**
 * Cabinet — namespaced artifact storage.
 *
 * Agents store arbitrary data here: drafts, images, logs, checkpoints.
 * Scoped per composite level. Isolated per parallel branch.
 * Not visible to parent scope unless visibility.expose declares it.
 */

import type { Cabinet, CabinetEntry } from '../types/agent.ts';

const WILDCARD = '*';
const SEPARATOR = '/';

function matchPattern(pattern: string, key: string): boolean {
  // Quick exact match
  if (pattern === key) return true;

  // Convert glob pattern to regex
  const regexStr = pattern
    .split(SEPARATOR)
    .map((part) => {
      if (part === '**') return '.*';
      if (part === WILDCARD) return '[^/]+';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join(SEPARATOR);

  return new RegExp(`^${regexStr}$`).test(key);
}

export class CabinetImpl implements Cabinet {
  private store = new Map<string, unknown>();

  put(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  exists(key: string): boolean {
    return this.store.has(key);
  }

  query(pattern: string): CabinetEntry[] {
    const results: CabinetEntry[] = [];
    for (const [key, value] of this.store) {
      if (matchPattern(pattern, key)) {
        results.push({ key, value });
      }
    }
    return results;
  }

  remove(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Create an independent copy of this cabinet (for parallel branch isolation) */
  clone(): CabinetImpl {
    const cloned = new CabinetImpl();
    for (const [key, value] of this.store) {
      cloned.put(key, structuredClone(value));
    }
    return cloned;
  }

  /** Merge another cabinet into this one using a merge strategy */
  merge(other: CabinetImpl, strategy: 'namespaced' | 'concat' | 'union' | 'overwrite', namespace?: string): void {
    for (const [key, value] of other.store) {
      const targetKey = namespace ? `${namespace}${SEPARATOR}${key}` : key;

      switch (strategy) {
        case 'namespaced':
          this.store.set(targetKey, structuredClone(value));
          break;
        case 'overwrite':
          this.store.set(key, structuredClone(value));
          break;
        case 'concat': {
          const existing = this.store.get(key);
          if (Array.isArray(existing) && Array.isArray(value)) {
            this.store.set(key, [...existing, ...structuredClone(value)]);
          } else {
            this.store.set(key, structuredClone(value));
          }
          break;
        }
        case 'union': {
          const existing = this.store.get(key);
          if (Array.isArray(existing) && Array.isArray(value)) {
            const merged = new Set([...existing, ...structuredClone(value)]);
            this.store.set(key, Array.from(merged));
          } else {
            this.store.set(key, structuredClone(value));
          }
          break;
        }
      }
    }
  }
}

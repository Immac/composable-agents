/**
 * Factory — parameterized agent creation.
 *
 * A parameterized factory is a function that takes a typed config object
 * and optional dependencies, then returns an Agent. This is the "acts like
 * a class" pattern — multiple instances, same behavior, no class keyword.
 *
 * The YAML pipeline declares which factory to use and what config to pass.
 * The framework resolves factories by name through FactoryRegistry.
 *
 * Example:
 *   ```ts
 *   export function create(config: MyConfig, deps: { provider: LLMProvider }): Agent {
 *     return { id: config.id, manifest: { ... }, execute: async (scope) => { ... } }
 *   }
 *   ```
 *
 *   ```yaml
 *   - factory: createMyAgent
 *     config:
 *       id: my-instance
 *       style: brand
 * ```
 */

/**
 * A factory function that creates an Agent from typed config and optional deps.
 * Config is user-supplied (from YAML). Deps are framework-injected.
 */
export type AgentFactory<TConfig = Record<string, unknown>, TDeps = Record<string, unknown>> = (
  config: TConfig,
  deps?: TDeps,
) => Agent | Promise<Agent>;

/**
 * Declares an agent instance created from a parameterized factory.
 * Used in pipeline/pool YAMLs to create multiple agents from the same factory.
 */
export interface FactoryInstanceDeclaration {
  /** Name of the registered factory */
  factory: string;

  /** Unique ID for this instance (becomes the agent's id) */
  as?: string;

  /** Configuration passed to the factory function */
  config?: Record<string, unknown>;

  /** Triggers for reactive execution */
  triggers?: FactoryTrigger[];

  /** Wait conditions for pipeline execution */
  waitFor?: string[];
}

/**
 * A trigger condition for reactive execution.
 * An agent runs when its trigger condition evaluates true against cabinet state.
 */
export interface FactoryTrigger {
  /** Condition expression (e.g. "cabinet.exists('api/contract')") */
  when: string;
  /** Cooldown in ms before re-triggering (default: 0) */
  cooldown?: number;
}

/**
 * Factory dependency injection context.
 * The framework resolves common deps (provider, registry) automatically.
 * Custom deps can be registered per-factory-type.
 */
export interface FactoryContext {
  provider?: { generate(system: string, prompt: string, signal?: AbortSignal): Promise<{ content: string }> };
  registry?: FactoryRegistry;
}

/**
 * Registry for named agent factories.
 * Factories are registered by name (string key) and can be instantiated by YAML.
 */
export interface FactoryRegistry {
  /** Register a factory function under a name */
  register<TConfig, TDeps>(name: string, factory: AgentFactory<TConfig, TDeps>, deps?: TDeps): void;

  /** Get a registered factory by name */
  get<TConfig, TDeps>(name: string): AgentFactory<TConfig, TDeps> | undefined;

  /** Get the deps for a registered factory */
  getDeps<TDeps>(name: string): TDeps | undefined;

  /** Instantiate an agent from a factory + config */
  instantiate<TConfig>(declaration: FactoryInstanceDeclaration): Promise<Agent>;

  /** Check if a factory is registered */
  has(name: string): boolean;

  /** List all registered factory names */
  list(): string[];
}

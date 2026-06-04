/**
 * FactoryRegistry — resolves factory names to functions, instantiates agents.
 *
 * A factory is a function: (config, deps) => Agent
 * Factories are registered by name. YAML references factories by name.
 * The registry injects framework-provided deps (provider, sub-registry).
 */

import type {
  Agent,
  AgentFactory,
  FactoryRegistry,
  FactoryInstanceDeclaration,
  FactoryContext,
} from '../types/index.ts';

export function createFactoryRegistry(): FactoryRegistry {
  const factories = new Map<string, { factory: AgentFactory; deps: unknown }>();

  return {
    register<TConfig, TDeps>(
      name: string,
      factory: AgentFactory<TConfig, TDeps>,
      deps?: TDeps,
    ): void {
      if (factories.has(name)) {
        // Warn but allow re-registration (useful for tests)
        process.stderr.write(`  ⚠ Factory "${name}" re-registered\n`);
      }
      factories.set(name, { factory: factory as AgentFactory, deps });
    },

    get<TConfig, TDeps>(name: string): AgentFactory<TConfig, TDeps> | undefined {
      const entry = factories.get(name);
      return entry?.factory as AgentFactory<TConfig, TDeps> | undefined;
    },

    getDeps<TDeps>(name: string): TDeps | undefined {
      const entry = factories.get(name);
      return entry?.deps as TDeps | undefined;
    },

    async instantiate<TConfig>(
      declaration: FactoryInstanceDeclaration,
    ): Promise<Agent> {
      const entry = factories.get(declaration.factory);
      if (!entry) {
        throw new Error(`Factory "${declaration.factory}" not registered`);
      }

      const config = {
        ...(declaration.config as Record<string, unknown> ?? {}),
        ...(declaration.as ? { id: declaration.as } : {}),
      } as unknown as TConfig;

      const context: FactoryContext = {
        registry: this,
      };

      const agent = await entry.factory(config, entry.deps);

      // Attach triggers if the agent manifest supports it
      if (declaration.triggers && declaration.triggers.length > 0) {
        (agent.manifest as Record<string, unknown>).triggers = declaration.triggers;
      }

      return agent;
    },

    has(name: string): boolean {
      return factories.has(name);
    },

    list(): string[] {
      return Array.from(factories.keys());
    },
  };
}

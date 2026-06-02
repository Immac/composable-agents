#!/usr/bin/env node

/**
 * Composable Agents CLI
 *
 * Usage:
 *   composable-agents validate <file>       Validate an agent.yaml
 *   composable-agents validate-pipeline <file>  Validate a pipeline.yaml
 *   composable-agents inspect <file>        Show agent structure
 *   composable-agents graph <file>          Show pipeline dependency graph
 *   composable-agents scaffold <type> <name>  Generate agent skeleton
 *   composable-agents explain <file>        Natural language pipeline summary
 *   composable-agents --help                Show this help
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAgentYaml, validateAgentManifest, AgentRegistry } from 'composable-agents';
import { loadPipelineYaml, validatePipeline } from 'composable-agents';
import type { Agent, AgentManifest } from 'composable-agents';

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
Composable Agents CLI — tools for building composable agent systems

Usage:
  composable-agents validate <file>           Validate an agent.yaml file
  composable-agents validate-pipeline <file>  Validate a pipeline.yaml file
  composable-agents inspect <file>            Show agent structure as JSON
  composable-agents graph <file>              Show pipeline dependency graph (JSON)
  composable-agents scaffold <type> <name>    Generate agent skeleton
  composable-agents explain <file>            Explain a pipeline in natural language
  composable-agents --help                    Show this help

Types for scaffold: llm-agent, code-agent, composite-agent
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'validate': {
      const file = args[1];
      if (!file) { console.error('Error: specify a file path'); process.exit(1); }
      try {
        const result = loadAgentYaml(resolve(file));
        console.log(JSON.stringify({ valid: true, agent: result.manifest.id, file: result.filePath }, null, 2));
      } catch (e) {
        console.log(JSON.stringify({ valid: false, error: (e as Error).message }, null, 2));
        process.exit(1);
      }
      break;
    }

    case 'validate-pipeline': {
      const file = args[1];
      if (!file) { console.error('Error: specify a file path'); process.exit(1); }
      try {
        const config = loadPipelineYaml(resolve(file));
        const registry = new AgentRegistry();
        // For validation, register agents from the same directory
        const validation = validatePipeline(config, registry);
        console.log(JSON.stringify({
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        }, null, 2));
        if (!validation.valid) process.exit(1);
      } catch (e) {
        console.log(JSON.stringify({ valid: false, error: (e as Error).message }, null, 2));
        process.exit(1);
      }
      break;
    }

    case 'inspect': {
      const file = args[1];
      if (!file) { console.error('Error: specify a file path'); process.exit(1); }
      try {
        const result = loadAgentYaml(resolve(file));
        console.log(JSON.stringify(result.manifest, null, 2));
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'scaffold': {
      const type = args[1];
      const name = args[2];
      if (!type || !name) { console.error('Error: composable-agents scaffold <type> <name>'); process.exit(1); }
      scaffoldAgent(type, name);
      break;
    }

    case 'graph': {
      const file = args[1];
      if (!file) { console.error('Error: specify a file path'); process.exit(1); }
      try {
        const config = loadPipelineYaml(resolve(file));
        const graph = {
          nodes: extractAgentIds(config.pipeline),
          edges: buildEdges(config.pipeline),
          reflexes: config.reflexes?.length ?? 0,
        };
        console.log(JSON.stringify(graph, null, 2));
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case 'explain': {
      const file = args[1];
      if (!file) { console.error('Error: specify a file path'); process.exit(1); }
      try {
        const config = loadPipelineYaml(resolve(file));
        const agentIds = extractAgentIds(config.pipeline);
        const reflexCount = config.reflexes?.length ?? 0;
        const cycleCount = config.learning?.maxCycles ?? 1;

        const lines: string[] = [
          `This pipeline runs ${agentIds.length} agent${agentIds.length !== 1 ? 's' : ''} in sequence:`,
          ...agentIds.map((id, i) => `  ${i + 1}. ${id}`),
        ];
        if (reflexCount > 0) {
          lines.push(`It has ${reflexCount} reflex rule${reflexCount !== 1 ? 's' : ''} for condition-action handling.`);
        }
        if (cycleCount > 1) {
          lines.push(`Learning loop runs for up to ${cycleCount} cycles.`);
        }
        console.log(lines.join('\n'));
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case '--help':
    case '-h':
    default:
      printUsage();
  }
}

function scaffoldAgent(type: string, name: string): void {
  const dir = resolve(process.cwd(), 'agents', name);
  mkdirSync(dir, { recursive: true });

  let yamlContent = '';
  let extraFiles: Array<{ name: string; content: string }> = [];

  switch (type) {
    case 'llm-agent':
      yamlContent = `id: ${name}
type: llm
version: 0.1.0
purpose: "Describe what this agent does"

deterministic:
  pre_checks:
    - condition: "has-error"
      action: skip

llm:
  prompt_template: ./prompt.md
  model: opencode-go/deepseek4flash
  temperature: 0.7

learning:
  channels: []
`;
      extraFiles.push({
        name: 'prompt.md',
        content: `You are {{agent.id}}. Your purpose is {{agent.purpose}}.

Task: {{task.input}}
Goal: {{task.goal}}

Respond to the task above.
`,
      });
      break;

    case 'code-agent':
      yamlContent = `id: ${name}
type: code
version: 0.1.0
purpose: "Describe what this agent does"

deterministic:
  pre_checks:
    - condition: "has-error"
      action: skip

code:
  entrypoint: ./index.ts
  timeout: 30000

learning:
  channels: []
`;
      extraFiles.push({
        name: 'index.ts',
        content: `import type { ExecutionScope, AgentResult } from 'composable-agents';

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  // Read input
  const input = scope.blackboard.task.input;

  // Do work
  const result = \`Processed: \${input}\`;

  // Write output
  scope.blackboard.setTaskOutput(result);

  return { status: 'success', output: result };
}
`,
      });
      break;

    case 'composite-agent':
      yamlContent = `id: ${name}
type: composite
version: 0.1.0
purpose: "Describe what this composite agent does"

pipeline:
  - sub-agent-1
  - sub-agent-2

learning:
  channels: []

visibility:
  expose:
    cabinet:
      - from: output/*
        as: results/
`;
      break;

    default:
      console.error(`Unknown agent type: ${type}. Use: llm-agent, code-agent, composite-agent`);
      process.exit(1);
  }

  writeFileSync(resolve(dir, 'agent.yaml'), yamlContent);
  for (const file of extraFiles) {
    writeFileSync(resolve(dir, file.name), file.content);
  }

  console.log(`Created ${type} "${name}" in ${dir}/`);
  console.log(`  - agents/${name}/agent.yaml`);
  for (const file of extraFiles) {
    console.log(`  - agents/${name}/${file.name}`);
  }
}

function extractAgentIds(steps: any[]): string[] {
  const ids: string[] = [];
  for (const step of steps) {
    if (typeof step === 'string') {
      ids.push(step);
    } else if (step.agent) {
      ids.push(step.agent);
    } else if (step.sequence) {
      ids.push(...extractAgentIds(step.sequence));
    } else if (step.parallel?.run) {
      for (const branch of step.parallel.run) {
        if (typeof branch === 'string') {
          ids.push(branch);
        } else {
          ids.push(...extractAgentIds([branch]));
        }
      }
    }
  }
  return ids;
}

function buildEdges(steps: any[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  const ids = extractAgentIds(steps);
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ from: ids[i]!, to: ids[i + 1]! });
  }
  return edges;
}

main().catch((e) => {
  console.error(`Unexpected error: ${(e as Error).message}`);
  process.exit(1);
});

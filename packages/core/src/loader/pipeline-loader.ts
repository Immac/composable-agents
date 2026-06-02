/**
 * Pipeline YAML Loader — parses pipeline.yaml files.
 *
 * Validates agent references against a registry and checks
 * condition/reflex configurations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { SequenceStep, ReflexRule } from '../types/index.ts';
import { AgentRegistry } from './agent-loader.ts';

export interface PipelineConfig {
  pipeline: SequenceStep[];
  reflexes?: ReflexRule[];
  learning?: {
    maxCycles?: number;
    detectors?: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function loadPipelineYaml(filePath: string): PipelineConfig {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Pipeline file not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const raw = parse(content);

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid pipeline file: ${resolvedPath} — expected a YAML object`);
  }

  if (!raw.pipeline || !Array.isArray(raw.pipeline)) {
    throw new Error(`Invalid pipeline file: ${resolvedPath} — missing "pipeline" array`);
  }

  return raw as PipelineConfig;
}

export function validatePipeline(
  config: PipelineConfig,
  registry: AgentRegistry,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.pipeline || config.pipeline.length === 0) {
    errors.push('Pipeline is empty');
    return { valid: false, errors, warnings };
  }

  for (const step of config.pipeline) {
    validateStep(step, registry, errors, warnings);
  }

  // Validate reflex target agents
  if (config.reflexes) {
    for (const reflex of config.reflexes) {
      if (reflex.target && !registry.has(reflex.target)) {
        warnings.push(`Reflex "${reflex.id}" targets "${reflex.target}" which is not in the agent registry`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateStep(
  step: SequenceStep | string,
  registry: AgentRegistry,
  errors: string[],
  warnings: string[],
): void {
  if (typeof step === 'string') {
    if (!registry.has(step)) {
      errors.push(`Agent "${step}" is not registered`);
    }
    return;
  }

  if ('sequence' in step && step.sequence) {
    for (const sub of step.sequence) {
      validateStep(sub, registry, errors, warnings);
    }
    return;
  }

  if ('parallel' in step && step.parallel) {
    for (const branch of step.parallel.run) {
      if (typeof branch === 'string') {
        if (!registry.has(branch)) {
          errors.push(`Agent "${branch}" in parallel group is not registered`);
        }
      } else {
        validateStep(branch, registry, errors, warnings);
      }
    }
    return;
  }

  if ('agent' in step && step.agent) {
    if (!registry.has(step.agent)) {
      errors.push(`Agent "${step.agent}" is not registered`);
    }
  }
}

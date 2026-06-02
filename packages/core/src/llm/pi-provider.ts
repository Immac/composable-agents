/**
 * PiBackendProvider — wraps pi's SDK as an LLMProvider.
 *
 * Resolves pi from the user's global install first, then falls back
 * to the project dependency. Each instance creates one pi session
 * so conversation history accumulates across calls.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LLMProvider, LLMResponse, LLMChunk } from '../types/llm';

const SYSTEM_PROMPT = `You are the LLM backend for the Composable Agents framework.
Respond accurately and concisely with the requested output format.`;

let sdkPromise: Promise<object> | null = null;

async function resolvePiSdk(): Promise<object> {
  // Try global pi first
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
    const pkgDir = join(globalRoot, '@earendil-works', 'pi-coding-agent');
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const mainEntry = pkg.main ?? './dist/index.js';
      const mainPath = join(pkgDir, mainEntry);
      if (existsSync(mainPath)) {
        return await import(mainPath);
      }
    }
  } catch { /* fall through */ }
  return await import('@earendil-works/pi-coding-agent');
}

async function getSdk(): Promise<object> {
  if (!sdkPromise) sdkPromise = resolvePiSdk();
  return sdkPromise;
}

export interface PiProviderOptions {
  modelId?: string;
  sessionDir?: string;
}

export class PiProvider implements LLMProvider {
  readonly id = 'pi';
  private options: Required<PiProviderOptions>;
  private session: {
    subscribe: (fn: (e: object) => void) => () => void;
    prompt: (text: string) => Promise<void>;
    dispose: () => void;
  } | null = null;
  private sessionPromise: Promise<typeof this.session> | null = null;

  constructor(options?: PiProviderOptions) {
    this.options = {
      modelId: options?.modelId ?? 'github-copilot/gpt-5-mini',
      sessionDir: options?.sessionDir ?? '.composable-agents/sessions',
    };
  }

  async generate(system: string, user: string, signal?: AbortSignal): Promise<LLMResponse> {
    if (signal?.aborted) return { content: '', model: this.options.modelId };
    const session = await this.getSession();
    let output = '';
    let error: Error | null = null;
    const unsub = session.subscribe((event) => {
      const e = event as { type?: string; assistantMessageEvent?: { type?: string; delta?: string } };
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        output += e.assistantMessageEvent.delta ?? '';
      }
    });
    try {
      await session.prompt(`${system}\n\n---\n\n${user}`);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    } finally {
      unsub();
    }
    if (error) throw error;
    return { content: output.trim(), model: this.options.modelId };
  }

  async *stream(system: string, user: string, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    if (signal?.aborted) return;
    const session = await this.getSession();
    const queue: string[] = [];
    let done = false;
    let streamError: Error | null = null;
    const unsub = session.subscribe((event) => {
      const e = event as { type?: string; assistantMessageEvent?: { type?: string; delta?: string } };
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        queue.push(e.assistantMessageEvent.delta ?? '');
      }
    });
    const promptPromise = session.prompt(`${system}\n\n---\n\n${user}`);
    try {
      while (!done) {
        if (signal?.aborted) return;
        while (queue.length > 0) yield { content: queue.shift()!, done: false };
        const raced = await Promise.race([
          promptPromise.then(() => 'done' as const),
          new Promise<'pending'>(r => setTimeout(() => r('pending'), 80)),
        ]);
        if (raced === 'done') {
          done = true;
          while (queue.length > 0) yield { content: queue.shift()!, done: false };
        }
      }
      await promptPromise.catch(err => { streamError = err; });
    } finally { unsub(); }
    if (streamError) throw streamError;
    yield { content: '', done: true };
  }

  dispose(): void {
    this.session?.dispose();
    this.session = null;
    this.sessionPromise = null;
  }

  private async getSession() {
    if (this.session) return this.session;
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = this.createSession();
    this.session = await this.sessionPromise;
    return this.session;
  }

  private async createSession() {
    const sdk = await getSdk();
    const { createAgentSession, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader, getAgentDir } = sdk as any;
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const models = modelRegistry.getAvailable() as Array<{ id?: string; name?: string; provider?: string }>;
    const parts = this.options.modelId.split('/').filter(Boolean);
    const modelPart = parts.length >= 2 ? parts.slice(1).join('/') : this.options.modelId;
    const providerPart = parts.length >= 2 ? parts[0]! : '';
    const model = providerPart && modelPart ? modelRegistry.find(providerPart, modelPart) : null;
    if (!model) {
      const available = models.slice(0, 20).map(m => `  ${m.provider ?? '?'}/${m.id ?? m.name ?? '?'}`).join('\n');
      throw new Error(`Model "${this.options.modelId}" not found.\nAvailable models:\n${available}`);
    }
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: getAgentDir(),
      systemPromptOverride: () => SYSTEM_PROMPT,
    });
    await loader.reload();
    const { session } = await createAgentSession({
      model, authStorage, modelRegistry, resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      noTools: 'all',
    });
    return session;
  }
}

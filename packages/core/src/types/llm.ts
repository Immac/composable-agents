/**
 * LLM Provider interface — abstracted backend for LLM calls.
 * Swap any provider: pi SDK, OpenAI, Anthropic, Ollama, etc.
 */

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  readonly id: string;

  generate(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LLMResponse>;

  stream?(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): AsyncIterable<LLMChunk>;
}

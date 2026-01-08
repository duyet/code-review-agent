import type { Config } from '../utils/types.js';

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export function createProvider(config: Config): LLMProvider {
  if (config.provider === 'claude' || config.provider === 'anthropic') {
    return new AnthropicProvider(config.anthropicApiKey!);
  }

  if (config.provider.startsWith('openrouter:')) {
    const model = config.provider.split(':')[1];
    return new OpenRouterProvider(config.openrouterApiKey!, model);
  }

  throw new Error(`Unknown provider: ${config.provider}`);
}

class AnthropicProvider implements LLMProvider {
  name = 'anthropic';

  constructor(private apiKey: string) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 4096,
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({
          role: m.role,
          content: m.content,
        })),
        system: messages.find((m) => m.role === 'system')?.content,
        tools: options?.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const toolCalls = data.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: c.id!,
        name: c.name!,
        arguments: c.input as Record<string, unknown>,
      }));

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }
}

class OpenRouterProvider implements LLMProvider {
  name = 'openrouter';

  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/duyet/code-review-agent',
        'X-Title': 'Code Review Agent',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens || 4096,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: options?.tools?.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })),
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }
}
